import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { parseStoredLcSession } from '@/lib/leetcodeHttp'

const USER_ID = 'emmanuel'

export async function GET() {
  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ lc_session: '', lc_csrf: '' })
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('lc_session, lc_csrf')
    .eq('user_id', USER_ID)
    .single()

  if (error || !data) {
    return NextResponse.json({ lc_session: '', lc_csrf: '' })
  }

  return NextResponse.json({ lc_session: data.lc_session ?? '', lc_csrf: data.lc_csrf ?? '' })
}

export async function POST(req: Request) {
  const body = await req.json()
  const rawSession = String(body.lc_session ?? '').trim()
  const rawCsrf = String(body.lc_csrf ?? '').trim()

  const { session: lc_session, csrf: lc_csrf } = parseStoredLcSession(rawSession, rawCsrf)

  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: USER_ID, lc_session, lc_csrf }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
