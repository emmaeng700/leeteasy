import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const USER_ID = 'emmanuel'

export type LcListSyncPayload = {
  syncedAt: string
  solvedIds: number[]
  bySlug?: Record<string, number>
  totalAcProblems?: number
  grindAcCount?: number
  extraAcCount?: number
}

function normalizePayload(raw: unknown): LcListSyncPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<LcListSyncPayload>
  if (!p.syncedAt || !Array.isArray(p.solvedIds)) return null
  return {
    syncedAt: String(p.syncedAt),
    solvedIds: p.solvedIds.filter(n => Number.isFinite(n)),
    bySlug: p.bySlug ?? {},
    totalAcProblems: p.totalAcProblems,
    grindAcCount: p.grindAcCount,
    extraAcCount: p.extraAcCount,
  }
}

export async function GET() {
  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ state: null })
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('lc_list_sync')
    .eq('user_id', USER_ID)
    .single()

  if (error || !data?.lc_list_sync) {
    return NextResponse.json({ state: null })
  }

  return NextResponse.json({ state: normalizePayload(data.lc_list_sync) })
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const state = normalizePayload(body)
  if (!state) {
    return NextResponse.json({ error: 'syncedAt and solvedIds required' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: USER_ID,
        lc_list_sync: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    if (/lc_list_sync|column/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Run supabase/step6-lc-list-sync.sql in Supabase SQL Editor' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, syncedAt: state.syncedAt })
}
