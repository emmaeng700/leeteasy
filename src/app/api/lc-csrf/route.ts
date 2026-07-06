import { NextResponse } from 'next/server'
import { bootstrapLcCsrf } from '@/lib/leetcodeHttp'

/** Fetch csrftoken from leetcode.com using a saved LEETCODE_SESSION. */
export async function POST(req: Request) {
  let session = ''
  try {
    const body = await req.json()
    session = String(body.session ?? body.lc_session ?? '').trim()
  } catch {
    return NextResponse.json({ csrf: '' })
  }

  const csrf = await bootstrapLcCsrf(session)
  return NextResponse.json({ csrf })
}
