import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifySecret, hashKey, ensureDbEncryptionKey, buildLicensePayload } from '@/lib/license'

export const runtime = 'nodejs'

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ─── POST /api/activate ─────────────────────────────────────
export async function POST(request) {
  if (!verifySecret(request)) {
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Clé ou identifiant invalide' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { school_id, license_key, hardware_fingerprint } = body

    if (!school_id || !license_key || !hardware_fingerprint) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'school_id, license_key et hardware_fingerprint requis' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    const keyHash = hashKey(license_key.trim().toUpperCase())
    // Look up license by hash
    const { data: license, error: licErr } = await supabase
      .from('licenses')
      .select('*, schools(*)')
      .eq('license_key_hash', keyHash)
      .single()

    if (licErr || !license) {
      await incrementFailedAttempts(supabase, school_id)
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Clé ou identifiant invalide' },
        { status: 401 }
      )
    }

    const school = license.schools
    if (!school || school.school_code !== school_id.trim().toUpperCase()) {
      await incrementFailedAttempts(supabase, school_id)
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Clé ou identifiant invalide' },
        { status: 401 }
      )
    }

    // Rate limit check
    if (license.failed_attempts >= RATE_LIMIT_MAX && license.last_failed_at) {
      const elapsed = Date.now() - new Date(license.last_failed_at).getTime()
      if (elapsed < RATE_LIMIT_WINDOW_MS) {
        return NextResponse.json(
          { error: 'RATE_LIMITED', message: 'Trop de tentatives. Réessayez dans 1 heure.' },
          { status: 429 }
        )
      }
      // Window expired, reset
      await supabase.from('licenses').update({ failed_attempts: 0 }).eq('id', license.id)
    }

    // Status checks
    if (license.status === 'REVOKED') {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Clé ou identifiant invalide' },
        { status: 401 }
      )
    }

    if (license.status === 'SUSPENDED' || !license.is_active) {
      return NextResponse.json(
        { error: 'LICENSE_SUSPENDED', message: 'Licence suspendue. Contactez ScolaDesk.' },
        { status: 403 }
      )
    }

    const fp = hardware_fingerprint.trim()

    // 1 PC = 1 school: refuse to bind a machine already bound to another
    // school's ACTIVE license. Same-school rebinds (reissued key after
    // unbind) are unaffected — the old license is REVOKED/unbound by then.
    if (license.status === 'PENDING_ACTIVATION') {
      const { data: boundElsewhere } = await supabase
        .from('licenses')
        .select('id, school_id')
        .eq('hardware_fingerprint', fp)
        .eq('status', 'ACTIVE')
        .neq('school_id', school.id)
        .limit(1)
        .maybeSingle()

      if (boundElsewhere) {
        await supabase.from('cap_audit_logs').insert({
          actor: 'system',
          action: 'ACTIVATION_BLOCKED_CROSS_SCHOOL',
          entity_type: 'license',
          entity_id: license.id,
          new_values: { school_code: school.school_code, fingerprint: fp, bound_to_school_id: boundElsewhere.school_id },
        })
        return NextResponse.json(
          { error: 'HARDWARE_ALREADY_BOUND', message: 'Ce matériel est déjà lié à un autre établissement. Contactez ScolaDesk.' },
          { status: 403 }
        )
      }
    }

    // PENDING_ACTIVATION → first activation, bind hardware
    if (license.status === 'PENDING_ACTIVATION') {
      await supabase.from('licenses').update({
        status: 'ACTIVE',
        hardware_fingerprint: fp,
        hardware_bound_at: new Date().toISOString(),
        failed_attempts: 0,
      }).eq('id', license.id)

      // Audit log
      await supabase.from('cap_audit_logs').insert({
        actor: 'system',
        action: 'LICENSE_ACTIVATED',
        entity_type: 'license',
        entity_id: license.id,
        new_values: { school_code: school.school_code, fingerprint: fp },
      })

      const dbKey = await ensureDbEncryptionKey(supabase, school)
      const payload = buildLicensePayload(school, license, dbKey)
      return NextResponse.json({ payload })
    }

    // ACTIVE → check hardware match
    if (license.status === 'ACTIVE') {
      if (license.hardware_fingerprint === fp) {
        // Same device — re-activation OK
        await supabase.from('licenses').update({ failed_attempts: 0 }).eq('id', license.id)

        const dbKey = await ensureDbEncryptionKey(supabase, school)
        const payload = buildLicensePayload(school, license, dbKey)
        return NextResponse.json({ payload })
      } else {
        // Different device — REJECT
        await incrementFailedAttempts(supabase, school_id, license.id)
        return NextResponse.json(
          { error: 'HARDWARE_MISMATCH', message: 'Matériel non autorisé' },
          { status: 403 }
        )
      }
    }

    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Clé ou identifiant invalide' },
      { status: 401 }
    )
  } catch (err) {
    console.error('[ACTIVATE]', err)
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

async function incrementFailedAttempts(supabase, schoolCode, licenseId) {
  const now = new Date().toISOString()

  if (licenseId) {
    const { data } = await supabase
      .from('licenses')
      .select('failed_attempts')
      .eq('id', licenseId)
      .single()

    await supabase.from('licenses').update({
      failed_attempts: (data?.failed_attempts || 0) + 1,
      last_failed_at: now,
    }).eq('id', licenseId)
    return
  }

  const { data: school } = await supabase
    .from('schools')
    .select('id')
    .eq('school_code', schoolCode?.trim()?.toUpperCase())
    .maybeSingle()

  if (!school) return

  const { data: license } = await supabase
    .from('licenses')
    .select('id, failed_attempts')
    .eq('school_id', school.id)
    .in('status', ['ACTIVE', 'PENDING_ACTIVATION'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (license) {
    await supabase.from('licenses').update({
      failed_attempts: (license.failed_attempts || 0) + 1,
      last_failed_at: now,
    }).eq('id', license.id)
  }
}
