import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || '').trim()
const RETAINED_SYNC_UIDS = 2

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// Deletes chunk rows for every sync_uid except the N most recent (by last chunk write).
async function pruneOldSyncUids(supabase, schoolId) {
  const { data: rows } = await supabase
    .from('sync_chunks')
    .select('sync_uid, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  const uniqueUids = [...new Set((rows || []).map((r) => r.sync_uid))]
  const staleUids = uniqueUids.slice(RETAINED_SYNC_UIDS)

  if (staleUids.length) {
    await supabase.from('sync_chunks').delete().eq('school_id', schoolId).in('sync_uid', staleUids)
  }
}

// ─── POST /api/sync ─────────────────────────────────────────
export async function POST(request) {
  const secret = request.headers.get('x-scoladesk-secret')
  if (secret !== PAYLOAD_SECRET) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      action, school_id, hardware_fingerprint, sync_type, student_count, payload, error_message,
      sync_uid, chunk_index, table_name, page, rows, records_sent,
    } = body

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

    // ─── Chunk upload (Phase 7 chunked full-snapshot sync) ───
    if (action === 'chunk') {
      if (!sync_uid || !table_name) {
        return NextResponse.json(
          { error: 'MISSING_FIELDS', message: 'Champs requis manquants' },
          { status: 400 }
        )
      }

      const { error: upsertError } = await supabase.from('sync_chunks').upsert({
        school_id: school.id,
        sync_uid,
        chunk_index: chunk_index ?? 0,
        table_name,
        page: page ?? 0,
        row_count: Array.isArray(rows) ? rows.length : 0,
        payload: rows || [],
      }, { onConflict: 'school_id,sync_uid,chunk_index' })

      if (upsertError) throw upsertError

      return NextResponse.json({ ok: true })
    }

    // ─── Completion: record success + telemetry + retention ──
    if (action === 'complete') {
      if (!sync_uid) {
        return NextResponse.json(
          { error: 'MISSING_FIELDS', message: 'Champs requis manquants' },
          { status: 400 }
        )
      }

      await supabase.from('sync_records').insert({
        school_id: school.id,
        sync_uid,
        sync_type,
        status: 'success',
        records_sent: records_sent ?? 0,
        actual_student_count: student_count ?? null,
      })

      const updates = { last_sync_at: new Date().toISOString() }
      if (student_count !== undefined) updates.student_count_sync = student_count
      await supabase.from('licenses').update(updates).eq('id', license.id)

      await pruneOldSyncUids(supabase, school.id)

      return NextResponse.json({ message: 'Synchronisation reçue' })
    }

    // ─── Best-effort failure report ───────────────────────────
    if (action === 'fail') {
      await supabase.from('sync_records').insert({
        school_id: school.id,
        sync_type,
        status: 'failed',
        records_sent: 0,
        actual_student_count: student_count ?? null,
        error_message: error_message || null,
      })

      return NextResponse.json({ message: 'Échec enregistré' })
    }

    // ─── Legacy single-record sync (no action field) ──────────
    const syncStatus = payload ? 'success' : 'failed'
    await supabase.from('sync_records').insert({
      school_id: school.id,
      sync_type,
      status: syncStatus,
      records_sent: payload ? Object.keys(payload).length : 0,
      actual_student_count: student_count ?? null,
      error_message: error_message || null,
    })

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
