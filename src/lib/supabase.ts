/**
 * Shared Supabase browser client — singleton to avoid multiple GoTrueClient instances.
 * Import `supabase` and `USER_ID` from here instead of calling createClient() in each page.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _client
}

/** Convenience re-export so callers can do `import { supabase } from '@/lib/supabase'` */
export const supabase = getSupabase()
export const USER_ID = 'emmanuel'
