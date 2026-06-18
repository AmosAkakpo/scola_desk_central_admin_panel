import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const PAYLOAD_SECRET = process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

function signPayload(payload) {
  const json = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', PAYLOAD_SECRET).update(json).digest('hex')
  const encoded = Buffer.from(json).toString('base64')
  return { payload: encoded, signature }
}

// ─── POST /api/activate — Verify OTP ────────────────────────
// Local app sends: { school_code, otp_code }
// Returns: { success: true, school_id } or error
export async function POST(request) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'verify-otp') {
      return handleVerifyOtp(body)
    }
    if (action === 'bind-hardware') {
      return handleBindHardware(body)
    }
    if (action === 'get-license') {
      return handleGetLicense(body)
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

// ─── Step 1: Verify OTP ─────────────────────────────────────
// Input: { action: 'verify-otp', school_code, otp_code }
// Output: { success, school_id }
async function handleVerifyOtp({ school_code, otp_code }) {
  if (!school_code || !otp_code) {
    return NextResponse.json(
      { error: 'MISSING_FIELDS', message: 'Code école et code OTP requis' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()

  const { data: school } = await supabase
    .from('schools')
    .select('id, status')
    .eq('school_code', school_code.trim().toUpperCase())
    .single()

  if (!school) {
    return NextResponse.json(
      { error: 'SCHOOL_NOT_FOUND', message: 'Code école introuvable' },
      { status: 404 }
    )
  }

  if (school.status !== 'pending_activation') {
    return NextResponse.json(
      { error: 'ALREADY_ACTIVATED', message: 'Cette école est déjà activée' },
      { status: 409 }
    )
  }

  const { data: otp } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('school_id', school.id)
    .eq('code', otp_code.trim())
    .eq('is_used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!otp) {
    // Increment attempts on the latest OTP for this school
    const { data: latestOtp } = await supabase
      .from('otp_codes')
      .select('id, attempts')
      .eq('school_id', school.id)
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestOtp) {
      await supabase
        .from('otp_codes')
        .update({ attempts: (latestOtp.attempts || 0) + 1 })
        .eq('id', latestOtp.id)
    }

    return NextResponse.json(
      { error: 'INVALID_OTP', message: 'Code OTP invalide ou expiré' },
      { status: 401 }
    )
  }

  if (otp.attempts >= 5) {
    return NextResponse.json(
      { error: 'OTP_LOCKED', message: 'Trop de tentatives. Demandez un nouveau code.' },
      { status: 429 }
    )
  }

  // Mark OTP as used
  await supabase
    .from('otp_codes')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('id', otp.id)

  return NextResponse.json({
    success: true,
    school_id: school.id,
    message: 'Code OTP vérifié avec succès',
  })
}

// ─── Step 2: Bind Hardware ──────────────────────────────────
// Input: { action: 'bind-hardware', school_id, fingerprint }
// Output: { success }
async function handleBindHardware({ school_id, fingerprint }) {
  if (!school_id || !fingerprint) {
    return NextResponse.json(
      { error: 'MISSING_FIELDS', message: 'school_id et fingerprint requis' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()

  const { data: school } = await supabase
    .from('schools')
    .select('id, status')
    .eq('id', school_id)
    .single()

  if (!school) {
    return NextResponse.json(
      { error: 'SCHOOL_NOT_FOUND', message: 'École introuvable' },
      { status: 404 }
    )
  }

  // Check existing binding
  const { data: existing } = await supabase
    .from('hardware_bindings')
    .select('id, fingerprint, rebound_count')
    .eq('school_id', school_id)
    .maybeSingle()

  if (existing) {
    // Rebind — store previous fingerprint
    await supabase
      .from('hardware_bindings')
      .update({
        previous_fingerprint: existing.fingerprint,
        fingerprint: fingerprint.trim(),
        bound_at: new Date().toISOString(),
        rebound_count: (existing.rebound_count || 0) + 1,
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('hardware_bindings')
      .insert({
        school_id,
        fingerprint: fingerprint.trim(),
      })
  }

  // Update school status to active
  await supabase.from('schools').update({ status: 'active' }).eq('id', school_id)
  await supabase.from('licenses').update({ activated_at: new Date().toISOString() }).eq('school_id', school_id)

  return NextResponse.json({
    success: true,
    message: 'Matériel lié avec succès',
  })
}

// ─── Step 3: Get License Payload ────────────────────────────
// Input: { action: 'get-license', school_id, fingerprint }
// Output: { payload (base64), signature }
async function handleGetLicense({ school_id, fingerprint }) {
  if (!school_id || !fingerprint) {
    return NextResponse.json(
      { error: 'MISSING_FIELDS', message: 'school_id et fingerprint requis' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()

  // Verify fingerprint matches
  const { data: binding } = await supabase
    .from('hardware_bindings')
    .select('fingerprint')
    .eq('school_id', school_id)
    .single()

  if (!binding || binding.fingerprint !== fingerprint.trim()) {
    return NextResponse.json(
      { error: 'FINGERPRINT_MISMATCH', message: 'Empreinte matérielle non reconnue' },
      { status: 403 }
    )
  }

  // Fetch school + license
  const { data: school } = await supabase
    .from('schools')
    .select('*, licenses(*)')
    .eq('id', school_id)
    .single()

  if (!school || !school.licenses?.[0]) {
    return NextResponse.json(
      { error: 'LICENSE_NOT_FOUND', message: 'Licence introuvable' },
      { status: 404 }
    )
  }

  const license = school.licenses[0]

  const licensePayload = {
    school_id: school.id,
    school_code: school.school_code,
    school_name: school.school_name,
    director_name: school.director_name,
    country: school.country,
    tier: license.tier,
    size: license.size,
    semesters_active: license.semesters_active,
    expiry_date: license.expiry_date,
    is_active: license.is_active,
    setup_fee: license.setup_fee,
    annual_fee: license.annual_fee,
    annual_fee_assigned: license.annual_fee_assigned,
    activated_at: license.activated_at,
    issued_at: new Date().toISOString(),
  }

  const signed = signPayload(licensePayload)

  return NextResponse.json({
    success: true,
    ...signed,
  })
}
