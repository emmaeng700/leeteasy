import { NextResponse } from 'next/server'
import { getSupabase, USER_ID } from '@/lib/supabase'

function isMissingTableError(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find')
}

export async function GET() {
  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ items: [], tableReady: false })
  }

  const { data, error } = await supabase
    .from('clipboard_items')
    .select('id, label, content, is_token, created_at')
    .eq('user_id', USER_ID)
    .order('is_token', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json({ items: [], tableReady: false })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [], tableReady: true })
}

export async function POST(req: Request) {
  const { label, content, is_token } = await req.json().catch(() => ({}))
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const trimmed = content.trim()

  if (is_token === true) {
    const { data: existing } = await supabase
      .from('clipboard_items')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('is_token', true)
      .eq('content', trimmed)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'duplicate', message: 'This token is already saved' }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('clipboard_items')
    .insert({
      user_id: USER_ID,
      label: (label ?? '').trim(),
      content: trimmed,
      is_token: is_token === true,
    })
    .select('id, label, content, is_token, created_at')
    .single()

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json({ error: 'Run supabase/step7-clipboard.sql' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { error } = await supabase
    .from('clipboard_items')
    .delete()
    .eq('id', id)
    .eq('user_id', USER_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
