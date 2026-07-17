import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifySecret, ensureDbEncryptionKey, buildLicensePayload } from '@/lib/license'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// Background check-in the local app calls at most once per day while
// online (see server/routes/activation.js runLicenseCheckin -- owner
// request 2026-07-16: CAP-side changes like renewal/suspension/reissue
// had NO way to reach an already-activated install short of the admin
// manually re-entering a key). Deliberately key-less: identity is
// school_id + hardware_fingerprint, the same pair every activated
// install already has stored locally. A renewal or reissue to the SAME
// device is picked up silently; a genuine device change still fails
// closed (HARDWARE_MISMATCH) and falls back to manual re-activation --
// this endpoint only ever reads, never binds a new fingerprint.
export async function POST(request) {
  if (!verifySecret(request)) {
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Clé ou identifiant invalide' },
      { status: 401 }
    )
  }

  try {
    const { school_id, hardware_fingerprint } = await request.json()
    if (!school_id || !hardware_fingerprint) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'school_id et hardware_fingerprint requis' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    const { data: school } = await supabase
      .from('schools')
      .select('*')
      .eq('school_code', school_id.trim().toUpperCase())
      .single()

    if (!school) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'École introuvable' }, { status: 404 })
    }

    const { data: license } = await supabase
      .from('licenses')
      .select('*')
      .eq('school_id', school.id)
      .eq('status', 'ACTIVE')
      .maybeSingle()

    if (!license) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Aucune licence active' }, { status: 404 })
    }

    if (!license.is_active) {
      return NextResponse.json({ error: 'LICENSE_SUSPENDED', message: 'Licence suspendue. Contactez ScolaDesk.' }, { status: 403 })
    }

    if (license.hardware_fingerprint !== hardware_fingerprint.trim()) {
      return NextResponse.json({ error: 'HARDWARE_MISMATCH', message: 'Matériel non autorisé' }, { status: 403 })
    }

    const dbKey = await ensureDbEncryptionKey(supabase, school)
    const payload = buildLicensePayload(school, license, dbKey)
    return NextResponse.json({ payload })
  } catch (err) {
    console.error('[LICENSE-STATUS]', err)
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Erreur serveur' }, { status: 500 })
  }
}
