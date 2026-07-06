import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isQuestionDoneForDailyToday } from '@/lib/dailyCompletion'
import { leetCodeUrl, resolveLeetCodeSlug } from '@/lib/utils'

const USER_ID = 'emmanuel'
const TZ = 'America/Chicago'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://leeteasy.vercel.app'
/** Match vercel.json cron (every 3 hours). Cooldown slightly under interval to avoid duplicates. */
const REMINDER_INTERVAL_HOURS = Number(process.env.REMINDER_INTERVAL_HOURS) || 3
const COOLDOWN_MS = Math.max(1, REMINDER_INTERVAL_HOURS * 60 - 10) * 60 * 1000

const diffColor: Record<string, string> = { Easy: '#16a34a', Medium: '#d97706', Hard: '#dc2626' }

type QuestionMeta = { title: string; difficulty: string; slug: string }
type QuestionJsonRow = { id: number; title: string; difficulty: string; slug?: string }

function todayCT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

function loadQuestionMap(): Record<number, QuestionMeta> {
  const qMap: Record<number, QuestionMeta> = {}
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'grind_questions.json'), 'utf-8')
    for (const q of JSON.parse(raw) as QuestionJsonRow[]) {
      qMap[q.id] = { title: q.title, difficulty: q.difficulty, slug: q.slug ?? '' }
    }
  } catch { /* ignore */ }
  return qMap
}

function getTodayQuestionIds(plan: {
  question_order: number[]
  per_day: number
  claimed_day_index?: number | null
  mode?: string | null
}): number[] {
  const perDay = plan.per_day
  const claimed = Number(plan.claimed_day_index ?? 0)
  const lastDay = plan.question_order.length > 0
    ? Math.floor((plan.question_order.length - 1) / perDay)
    : 0
  const dayIdx = Math.min(Math.max(0, claimed), lastDay)
  const start = dayIdx * perDay
  return plan.question_order
    .slice(start, start + perDay)
    .filter(id => Number.isFinite(id) && id > 0)
}

export async function GET(req: NextRequest) {
  const isPreview = req.nextUrl.searchParams.get('preview') === '1'
    && process.env.NODE_ENV !== 'production'

  if (!isPreview) {
    const authHeader = req.headers.get('authorization') ?? ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    const secret = bearerToken ?? req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const to = process.env.NOTIFICATION_EMAIL ? [process.env.NOTIFICATION_EMAIL] : []
  if (!isPreview && to.length === 0) {
    return NextResponse.json({ error: 'Missing NOTIFICATION_EMAIL env var' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  )

  const todayStr = todayCT()

  if (!isPreview) {
    const { data: planMeta } = await supabase
      .from('study_plan')
      .select('last_notified_at')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (planMeta?.last_notified_at) {
      const msSinceLast = Date.now() - new Date(planMeta.last_notified_at as string).getTime()
      if (msSinceLast < COOLDOWN_MS) {
        const minsLeft = Math.ceil((COOLDOWN_MS - msSinceLast) / 60000)
        return NextResponse.json({ skipped: `Cooldown - next email in ~${minsLeft} min` })
      }
    }
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('email_enabled,revision_cap')
    .eq('user_id', USER_ID)
    .maybeSingle()

  if (!isPreview && settings?.email_enabled === false) {
    return NextResponse.json({ skipped: 'Email disabled' })
  }

  const qMap = loadQuestionMap()

  const [planRes, progressRes] = await Promise.all([
    supabase.from('study_plan').select('*').eq('user_id', USER_ID).maybeSingle(),
    supabase.from('progress').select('question_id,solved,last_daily_done,daily_rep_count,daily_rep_date').eq('user_id', USER_ID),
  ])

  const plan = planRes.data as {
    question_order: number[]
    per_day: number
    claimed_day_index?: number | null
    mode?: string | null
  } | null

  const progress: Record<string, {
    solved?: boolean
    last_daily_done?: string | null
    daily_rep_count?: number
    daily_rep_date?: string | null
  }> = {}
  for (const row of progressRes.data ?? []) {
    const id = String((row as { question_id: number }).question_id)
    progress[id] = {
      solved: !!(row as { solved?: boolean }).solved,
      last_daily_done: (row as { last_daily_done?: string | null }).last_daily_done ?? null,
      daily_rep_count: (row as { daily_rep_count?: number }).daily_rep_count ?? 0,
      daily_rep_date: (row as { daily_rep_date?: string | null }).daily_rep_date ?? null,
    }
  }

  const todayIds = plan ? getTodayQuestionIds(plan) : []
  const todayPlanQs = todayIds.map(id => {
    const q = qMap[id]
    return {
      id,
      title: q?.title ?? `Question ${id}`,
      difficulty: q?.difficulty ?? '',
      slug: q?.slug ?? '',
      doneForToday: isQuestionDoneForDailyToday(id, progress, todayStr),
    }
  })

  const planComplete = plan?.question_order?.length
    ? plan.question_order.every(id => !!progress[String(id)]?.solved || isQuestionDoneForDailyToday(id, progress, todayStr))
    : false

  const hasPlan = todayPlanQs.length > 0 && !planComplete
  const unsolvedQs = todayPlanQs.filter(q => !q.doneForToday)
  const dailiesDone = hasPlan && unsolvedQs.length === 0
  const solvedCount = todayPlanQs.filter(q => q.doneForToday).length
  const totalCount = todayPlanQs.length
  const perDay = plan?.per_day ?? totalCount

  const { data: dueRows } = await supabase
    .from('progress')
    .select('question_id,review_count,next_review')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .lte('next_review', todayStr)

  const dueReviews = dueRows ?? []
  const reviewsActive = dueReviews.length > 0
  const isDayComplete = (dailiesDone || !hasPlan) && !reviewsActive

  // No spam every 3h when today's work is finished.
  if (!isPreview && isDayComplete) {
    return NextResponse.json({ skipped: 'Day complete - no reminder needed' })
  }

  let subject: string
  let html: string

  if (isDayComplete) {
    // Preview mode only (production skips above when complete).
    subject = planComplete
      ? 'All 727 grind questions done - keep reviews going'
      : `Daily done - ${solvedCount}/${totalCount} questions`
    html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9fafb;padding:24px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;">
        <h1 style="color:#16a34a;margin:0 0 12px;">LeetEasy</h1>
        <p style="color:#374151;line-height:1.6;">${planComplete
          ? 'You finished the full grind list. Check Reviews for spaced repetition.'
          : `${solvedCount}/${totalCount} daily questions done today. Nice work.`}</p>
        <p style="margin-top:20px;"><a href="${APP_URL}/daily" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Open Daily</a></p>
      </div></body></html>`
  } else {
    const parts: string[] = []
    if (hasPlan && !dailiesDone) parts.push(`${unsolvedQs.length} daily left`)
    if (reviewsActive) parts.push(`${dueReviews.length} reviews due`)
    if (planComplete && !reviewsActive) parts.push('catch-up or reviews')
    subject = parts.length ? `LeetEasy: ${parts.join(' - ')}` : 'LeetEasy daily reminder'

    const questionRows = unsolvedQs.map(q => {
      const lc = q.slug ? leetCodeUrl(resolveLeetCodeSlug(q.id, q.slug)) : null
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          <a href="${lc ?? APP_URL + '/daily'}" style="color:#1d4ed8;font-weight:600;text-decoration:none;">#${q.id} ${q.title}</a>
        </td>
        <td style="text-align:right;color:${diffColor[q.difficulty] ?? '#666'};font-size:12px;font-weight:bold;">${q.difficulty}</td>
      </tr>`
    }).join('')

    const planSection = planComplete
      ? `<p style="color:#15803d;font-weight:600;">Grind list complete (727/727). Clear catch-up or reviews.</p>`
      : !hasPlan
        ? `<p>No questions scheduled today. <a href="${APP_URL}/daily">Set your plan day</a>.</p>`
        : !dailiesDone
          ? `<h3 style="margin:16px 0 8px;">Today&apos;s questions (${solvedCount}/${totalCount})</h3>
             <table style="width:100%;border-collapse:collapse;">${questionRows}</table>`
          : `<p style="color:#15803d;">Daily questions done. Clear reviews below.</p>`

    const reviewRows = dueReviews.map(r => {
      const q = qMap[(r as { question_id: number }).question_id]
      return `<li style="margin:6px 0;">#${(r as { question_id: number }).question_id} ${q?.title ?? 'Review'}</li>`
    }).join('')

    html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9fafb;padding:24px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;">
        <h1 style="color:#4f46e5;margin:0 0 8px;">LeetEasy Daily</h1>
        <p style="color:#6b7280;margin:0 0 16px;">Reminder every ~3 hours until daily + reviews are done.</p>
        ${planSection}
        ${reviewsActive ? `<h3 style="margin:16px 0 8px;">Reviews due (${dueReviews.length})</h3><ul style="padding-left:18px;">${reviewRows}</ul>` : ''}
        <p style="margin-top:20px;"><a href="${APP_URL}/daily" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Go to Daily</a></p>
      </div></body></html>`
  }

  if (isPreview) {
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing RESEND_API_KEY' }, { status: 500 })
  }

  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM ?? 'LeetEasy <onboarding@resend.dev>'
  const { data: emailData, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  })

  if (error) {
    console.error('[notify-daily]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('study_plan').update({ last_notified_at: new Date().toISOString() }).eq('user_id', USER_ID)

  return NextResponse.json({ sent: true, emailId: emailData?.id, subject })
}
