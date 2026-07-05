/** User-facing message when Supabase env or network fails. */
export function formatSupabaseLoadError(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : err)
  if (msg.includes('NEXT_PUBLIC_SUPABASE')) {
    return 'Supabase not configured on this deploy. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel ? Settings ? Environment Variables, then redeploy.'
  }
  if (isFetchTransportError(msg)) {
    return 'Could not reach Supabase. Check your connection and env vars.'
  }
  return msg
}

function isFetchTransportError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('failed to fetch') || m.includes('fetch failed') || m.includes('networkerror')
}
