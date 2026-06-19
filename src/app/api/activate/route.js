import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'

export const runtime = 'nodejs'

const PAYLOAD_SECRET = process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

function signPayload(payload) {
  const json = JSON.stringify(payload)
  const signature = createHmac('sha256', PAYLOAD_SECRET).update(json).digest('hex')
  const encoded = Buffer.from(json).toString('base64')
  return { payload: encoded, signature }
}

function buildLicensePayload(school, license) {
  return {
    school_id: school.id,
    school_code: school.school_code,
    school_name: school.school_name,
    director_name: school.director_name,
    country: school.country,
    tier: license.tier,
    size: license.size,
    semesters_active: license.semesters_active,
    expiry_date: license.expiry_date,
    grace_period_days: license.grace_period_days || 15,
    is_active: license.is_active,
    setup_fee: license.setup_fee,
    annual_fee: license.annual_fee,
    annual_fee_assigned: license.annual_fee_assigned,
    activated_at: license.activated_at,
    issued_at: new Date().toISOString(),
  }
}

// ─── POST /api/activate ─────────────────────────────────────
// Single endpoint. Actions: activate, check-key
export async function POST(request) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'activate') {
      return handleActivate(body)
    }
    if (action === 'check-key') {
      return handleCheckKey(body)
    }

    return NextResponse.json(
      { error: 'INVALID_ACTION', message: 'Action non reconnue' },
      { status: 400 }
    )
  } catch (err) {
    console.error('[ACTIVATE]', err)
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// ─── Activate: license_key + fingerprint ─────────────────────
// Three scenarios:
// 1. Key not yet bound → bind fingerprint, return license (first activation)
// 2. Key bound + fingerprint matches → return license (re-activation same device)
// 3. Key bound + fingerprint different → REJECT (different device)
async function handleActivate({ license_key, fingerprint }) {
  if (!license_key || !fingerprint) {
    return NextResponse.json(
      { error: 'MISSING_FIELDS', message: 'Clé de licence et empreinte matérielle requises' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()

  // Find license by key
  const { data: license, error: licErr } = await supabase
    .from('licenses')
    .select('*, schools(*)')
    .eq('license_key', license_key.trim().toUpperCase())
    .single()

  if (licErr || !license) {
    return NextResponse.json(
      { error: 'INVALID_KEY', message: 'Clé de licence invalide' },
      { status: 404 }
    )
  }

  const school = license.schools
  if (!school) {
    return NextResponse.json(
      { error: 'SCHOOL_NOT_FOUND', message: 'École associée introuvable' },
      { status: 404 }
    )
  }

  if (!license.is_active) {
    return NextResponse.json(
      { error: 'LICENSE_INACTIVE', message: 'Cette licence a été désactivée. Contactez ScolaDesk.' },
      { status: 403 }
    )
  }

  // Check hardware binding
  const { data: binding } = await supabase
    .from('hardware_bindings')
    .select('*')
    .eq('school_id', school.id)
    .maybeSingle()

  if (binding) {
    if (binding.fingerprint === fingerprint.trim()) {
      // Same device — re-activation, return license
      const payload = buildLicensePayload(school, license)
      const signed = signPayload(payload)
      return NextResponse.json({ success: true, type: 'reactivation', ...signed })
    } else {
      // Different device — REJECT
      return NextResponse.json(
        {
          error: 'DEVICE_MISMATCH',
          message: 'Cette licence est liée à un autre appareil. Contactez ScolaDesk pour transférer.',
        },
        { status: 403 }
      )
    }
  }

  // Not yet bound — first activation
  await supabase.from('hardware_bindings').insert({
    school_id: school.id,
    fingerprint: fingerprint.trim(),
  })

  // Update school status + activation timestamp
  await supabase.from('schools').update({ status: 'active' }).eq('id', school.id)
  await supabase.from('licenses').update({ activated_at: new Date().toISOString() }).eq('id', license.id)

  const payload = buildLicensePayload(school, license)
  const signed = signPayload(payload)

  return NextResponse.json({ success: true, type: 'first_activation', ...signed })
}

// ─── Check Key: validate without activating ──────────────────
// Used to preview school info before committing
async function handleCheckKey({ license_key }) {
  if (!license_key) {
    return NextResponse.json(
      { error: 'MISSING_FIELDS', message: 'Clé de licence requise' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()

  const { data: license } = await supabase
    .from('licenses')
    .select('tier, size, semesters_active, expiry_date, is_active, grace_period_days, license_key, schools(school_name, school_code, director_name, country)')
    .eq('license_key', license_key.trim().toUpperCase())
    .single()

  if (!license) {
    return NextResponse.json(
      { error: 'INVALID_KEY', message: 'Clé de licence invalide' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    school_name: license.schools?.school_name,
    school_code: license.schools?.school_code,
    director_name: license.schools?.director_name,
    tier: license.tier,
    size: license.size,
    is_active: license.is_active,
  })
}
