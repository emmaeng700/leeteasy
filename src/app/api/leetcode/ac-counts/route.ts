import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { parseLeetCodeJsonText } from '@/lib/parseLeetCodeResponse'
import { lcFetchInit, leetCodeGraphqlHeaders, resolveLcSessionCredentials } from '@/lib/leetcodeHttp'

const LC_GRAPHQL = 'https://leetcode.com/graphql'
const USER_ID = 'emmanuel'

const SUBMISSION_PAGE = 20
const MAX_PAGES = 600

const QUERY = `query AcCountPage($offset: Int!, $limit: Int!, $slug: String) {
  submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
    hasNext
    submissions {
      statusDisplay
      titleSlug
    }
  }
}`

/** Accepted submission counts per problem slug from the user's LeetCode session (paginated submission history). */
export async function POST(req: NextRequest) {
  let session = ''
  let csrfToken = ''
  try {
    const body = await req.json()
    session = body.session ?? body.lc_session ?? ''
    csrfToken = body.csrfToken ?? body.lc_csrf ?? ''
  } catch {
    /* empty body */
  }

  if (!session || !csrfToken) {
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('user_settings')
        .select('lc_session, lc_csrf')
        .eq('user_id', USER_ID)
        .single()
      session = session || (data?.lc_session ?? '')
      csrfToken = csrfToken || (data?.lc_csrf ?? '')
    } catch {
      /* no supabase */
    }
  }

  const creds = await resolveLcSessionCredentials(session, csrfToken)
  session = creds.session
  csrfToken = creds.csrf

  if (!session || !csrfToken) {
    return NextResponse.json({ bySlug: {} as Record<string, number>, error: 'no_session' })
  }

  const bySlug: Record<string, number> = {}
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(LC_GRAPHQL, {
      method: 'POST',
      headers: leetCodeGraphqlHeaders(session, csrfToken),
      body: JSON.stringify({
        query: QUERY,
        variables: { offset, limit: SUBMISSION_PAGE },
      }),
      ...lcFetchInit,
    })

    const text = await res.text()
    const parsed = parseLeetCodeJsonText(text, res.status)
    if (!parsed.ok) {
      if (parsed.error === 'non_json_html') {
        return NextResponse.json({ bySlug: {} })
      }
      return NextResponse.json({ bySlug: {}, error: 'Could not load counts.' }, { status: 502 })
    }
    const json = parsed.data as {
      errors?: Array<{ message?: string }>
      data?: { submissionList?: { hasNext?: boolean; submissions?: Array<{ statusDisplay?: string; titleSlug?: string }> } }
    }
    if (json.errors?.length) {
      const msg = String(json.errors[0]?.message ?? 'graphql_error')
      return NextResponse.json({ bySlug: {}, error: msg }, { status: 400 })
    }

    const list = json?.data?.submissionList
    if (!list) break

    for (const s of list.submissions ?? []) {
      if (s.statusDisplay === 'Accepted' && s.titleSlug) {
        bySlug[s.titleSlug] = (bySlug[s.titleSlug] ?? 0) + 1
      }
    }

    offset += SUBMISSION_PAGE
    if (!list.hasNext) break
  }

  return NextResponse.json({ bySlug })
}
