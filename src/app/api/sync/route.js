import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || '').trim()

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ─── POST /api/sync ─────────────────────────────────────────
export async function POST(request) {
  const secret = request.headers.get('x-scoladesk-secret')
  if (secret !== PAYLOAD_SECRET) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { school_id, hardware_fingerprint, sync_type, chunk_number, total_chunks, student_count, payload } = body

    if (!school_id || !hardware_fingerprint || !sync_type) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'Champs requis manquants' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

    // Validate school + fingerprint
    const { data: school } = await supabase
      .from('schools')
      .select('id, school_code')
      .eq('school_code', school_id.trim().toUpperCase())
      .single()

    if (!school) {
      return NextResponse.json(
        { error: 'SCHOOL_NOT_FOUND', message: 'École introuvable' },
        { status: 404 }
      )
    }

    const { data: license } = await supabase
      .from('licenses')
      .select('id, hardware_fingerprint, status')
      .eq('school_id', school.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!license || license.hardware_fingerprint !== hardware_fingerprint.trim()) {
      return NextResponse.json(
        { error: 'HARDWARE_MISMATCH', message: 'Matériel non autorisé' },
        { status: 403 }
      )
    }

    // Record sync
    const syncStatus = payload ? 'success' : 'failed'
    await supabase.from('sync_records').insert({
      school_id: school.id,
      sync_type,
      status: syncStatus,
      records_sent: payload ? Object.keys(payload).length : 0,
      chunk_reached: chunk_number || null,
    })

    // Update license telemetry
    const updates = { last_sync_at: new Date().toISOString() }
    if (student_count !== undefined) updates.student_count_sync = student_count
    await supabase.from('licenses').update(updates).eq('id', license.id)

    return NextResponse.json({ message: 'Synchronisation reçue' })
  } catch (err) {
    console.error('[SYNC]', err)
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
