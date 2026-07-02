'use client'

import { createBrowserClient } from '@supabase/ssr'

let client = null

export function getSupabase() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  return client
}

// Returns the logged-in user's email for audit log attribution.
// Falls back to 'unknown' only if the session is somehow missing
// (should not happen behind AuthGuard).
export async function getCurrentActor() {
  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email || 'unknown'
}
