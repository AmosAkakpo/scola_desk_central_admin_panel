import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'

export const runtime = 'nodejs'

const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || '').trim()
const RESET_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Must derive the EXACT same code as the local app's auth.js resetCodeFor():
// HMAC-SHA256(secret, RESET|SCHOOL_CODE|YYYY-MM-DD) -> 8 safe-charset chars.
function resetCodeFor(schoolCode, dateStr) {
  const digest = createHmac('sha256', PAYLOAD_SECRET)
    .update(`RESET|${schoolCode.toUpperCase()}|${dateStr}`)
    .digest()
  let code = ''
  for (let i = 0; i < 8; i++) code += RESET_CHARSET[digest[i] % RESET_CHARSET.length]
  return code
}

// ─── POST /api/reset-code ───────────────────────────────────
// Owner-only (valid CAP login session required — the secret can never
// reach the browser, so the code is computed server-side).
export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { school_code } = await request.json()
    if (!school_code) {
      return NextResponse.json({ error: 'MISSING_FIELDS', message: 'school_code requis' }, { status: 400 })
    }

    const d = new Date()
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const raw = resetCodeFor(school_code.trim(), dateStr)

    return NextResponse.json({
      code: `${raw.slice(0, 4)}-${raw.slice(4)}`,
      valid_on: dateStr,
    })
  } catch (err) {
    console.error('[RESET-CODE]', err)
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Erreur serveur' }, { status: 500 })
  }
}
