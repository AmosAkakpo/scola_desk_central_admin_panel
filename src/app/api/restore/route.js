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

// ─── POST /api/restore ──────────────────────────────────────
// Serves the cloud backup back to a freshly re-activated local app.
// Same auth as /api/sync: secret header + school + ACTIVE-license
// fingerprint match — so only the machine currently bound to the
// license can pull this school's data.
export async function POST(request) {
  const secret = request.headers.get('x-scoladesk-secret')
  if (secret !== PAYLOAD_SECRET) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, school_id, hardware_fingerprint, sync_uid, chunk_index } = body

    if (!action || !school_id || !hardware_fingerprint) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'Champs requis manquants' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

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

    // ─── 'info': most recent complete backup, if any ─────────
    if (action === 'info') {
      // Latest success rows first; take the first whose chunks still
      // exist (retention keeps the 2 most recent chunk sets).
      const { data: successes } = await supabase
        .from('sync_records')
        .select('sync_uid, synced_at, records_sent')
        .eq('school_id', school.id)
        .eq('status', 'success')
        .not('sync_uid', 'is', null)
        .order('synced_at', { ascending: false })
        .limit(5)

      for (const rec of successes || []) {
        const { count } = await supabase
          .from('sync_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', school.id)
          .eq('sync_uid', rec.sync_uid)

        if (count > 0) {
          return NextResponse.json({
            has_backup: true,
            sync_uid: rec.sync_uid,
            chunk_count: count,
            records_sent: rec.records_sent,
            synced_at: rec.synced_at,
          })
        }
      }

      return NextResponse.json({ has_backup: false })
    }

    // ─── 'chunk': one chunk by index ─────────────────────────
    if (action === 'chunk') {
      if (!sync_uid || chunk_index === undefined || chunk_index === null) {
        return NextResponse.json(
          { error: 'MISSING_FIELDS', message: 'sync_uid et chunk_index requis' },
          { status: 400 }
        )
      }

      const { data: chunk } = await supabase
        .from('sync_chunks')
        .select('table_name, page, row_count, payload')
        .eq('school_id', school.id)
        .eq('sync_uid', sync_uid)
        .eq('chunk_index', chunk_index)
        .single()

      if (!chunk) {
        return NextResponse.json(
          { error: 'CHUNK_NOT_FOUND', message: 'Segment introuvable' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        table_name: chunk.table_name,
        page: chunk.page,
        row_count: chunk.row_count,
        rows: chunk.payload,
      })
    }

    return NextResponse.json(
      { error: 'INVALID_ACTION', message: 'Action inconnue' },
      { status: 400 }
    )
  } catch (err) {
    console.error('[RESTORE]', err)
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
