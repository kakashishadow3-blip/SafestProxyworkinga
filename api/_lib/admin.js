import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://noggpecapmtgnsykqcbu.supabase.co'

/* Service-role client — bypasses RLS. Server-side only, never exposed to the browser. */
export function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server.')
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/* Verify the caller's Supabase access token (sent as Authorization: Bearer <token>).
   Returns { admin, user } or null when the token is missing/invalid. */
export async function requireUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const token = String(header).replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const admin = getAdminClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data || !data.user) return null
  return { admin, user: data.user }
}
