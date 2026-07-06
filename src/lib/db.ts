import { supabase } from './supabase'
import { dailyRepsFromProgress, normalizeRepDate, notifyDailyRepsChanged, readDailyRepsLocal, writeDailyRepsLocal } from './dailyCompletion'
import { computeDailyGoalsMetToday } from './streakGoals'
import { todayISOChicago } from './studyPlanDay'
import { srInterval } from './utils'

const USER_ID = 'emmanuel'
const MOCK_SESSIONS_LOCAL_KEY = 'leetcodemr_mock_sessions'

function isMissingTableError(message: string | undefined | null): boolean {
  const m = (message ?? '').toLowerCase()
  return (
    m.includes("could not find the table") ||
    m.includes('schema cache') ||
    m.includes('relation') && m.includes('does not exist')
  )
}

function isMissingColumnError(message: string | undefined | null): boolean {
  const m = (message ?? '').toLowerCase()
  return (
    (m.includes('column') && m.includes('does not exist')) ||
    (m.includes('could not find the') && m.includes('column') && m.includes('schema cache'))
  )
}

function isFetchTransportError(message: string | undefined | null): boolean {
  const m = (message ?? '').toLowerCase()
  return m.includes('failed to fetch') || m.includes('fetch failed') || m.includes('networkerror')
}

function readLocalMockSessions(): MockSessionRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MOCK_SESSIONS_LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as MockSessionRecord[] : []
  } catch {
    return []
  }
}

function writeLocalMockSessions(rows: MockSessionRecord[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MOCK_SESSIONS_LOCAL_KEY, JSON.stringify(rows.slice(0, 50)))
  } catch {}
}

function localDateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localTodayISO() {
  return localDateISO(new Date())
}

// ─── Progress ─────────────────────────────────────────────────────────────────
export async function getProgress(): Promise<Record<string, any> | null> {
  try {
    const [{ data, error }, masteryRuns] = await Promise.all([
      supabase
        .from('progress')
        .select('*')
        .eq('user_id', USER_ID),
      getMasteryRunsByQuestion(),
    ])

    if (error) {
      console.error('[db] getProgress:', error.message)
      return null
    }

    const result: Record<string, any> = {}
    for (const row of data || []) {
      const runs = masteryRuns[String(row.question_id)] ?? 0
      result[String(row.question_id)] = {
        solved: row.solved,
        starred: row.starred,
        notes: row.notes,
        review_count: row.review_count,
        next_review: row.next_review,
        last_reviewed: row.last_reviewed,
        review_carry_date: row.review_carry_date ?? null,
        last_daily_done: normalizeRepDate(row.last_daily_done),
        daily_rep_count: row.daily_rep_count ?? 0,
        daily_rep_date: normalizeRepDate(row.daily_rep_date),
      }
    }
    return result
  } catch (e) {
    console.error('[db] getProgress:', e)
    return null
  }
}

function progressUpsertBase(existing: Record<string, unknown> | null | undefined) {
  return {
    solved: !!(existing?.solved),
    starred: !!(existing?.starred),
    notes: String(existing?.notes ?? ''),
    review_count: Number(existing?.review_count ?? 0),
    next_review: (existing?.next_review as string | null | undefined) ?? null,
    last_reviewed: (existing?.last_reviewed as string | null | undefined) ?? null,
    review_carry_date: (existing?.review_carry_date as string | null | undefined) ?? null,
    last_daily_done: (existing?.last_daily_done as string | null | undefined) ?? null,
    daily_rep_count: Number(existing?.daily_rep_count ?? 0),
    daily_rep_date: normalizeRepDate(existing?.daily_rep_date),
  }
}

/** Increment today's daily rep for a question (persisted in progress row). */
export async function bumpDailyRep(questionId: number): Promise<{ ok: boolean; count: number; error?: string | null }> {
  const today = todayISOChicago()
  const { data: existing, error: readErr } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()

  if (readErr && !isMissingColumnError(readErr.message)) {
    return { ok: false, count: 0, error: readErr.message }
  }

  const base = progressUpsertBase(existing as Record<string, unknown> | null)
  const prevCount = base.daily_rep_date === today ? (base.daily_rep_count ?? 0) : 0
  const count = prevCount + 1

  const { error } = await supabase.from('progress').upsert({
    user_id: USER_ID,
    question_id: questionId,
    ...base,
    daily_rep_count: count,
    daily_rep_date: today,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })

  if (error) {
    if (!isMissingColumnError(error.message)) {
      console.error('[db] bumpDailyRep:', error.message)
    }
    writeDailyRepsLocal(questionId, count, today)
    notifyDailyRepsChanged()
    return { ok: false, count: prevCount, error: error.message }
  }

  writeDailyRepsLocal(questionId, count, today)
  notifyDailyRepsChanged()
  try {
    await syncStreakActivityFromGoals()
  } catch (e) {
    console.error('[db] syncStreakActivityFromGoals:', e)
  }
  return { ok: true, count }
}

/** Set today's daily rep count for a question (e.g. when target reps reached). */
export async function setDailyRep(questionId: number, count: number): Promise<{ ok: boolean; error?: string | null }> {
  const today = todayISOChicago()
  const { data: existing, error: readErr } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()

  if (readErr && !isMissingColumnError(readErr.message)) {
    return { ok: false, error: readErr.message }
  }

  const base = progressUpsertBase(existing as Record<string, unknown> | null)
  const safeCount = Math.max(0, count)
  const { error } = await supabase.from('progress').upsert({
    user_id: USER_ID,
    question_id: questionId,
    ...base,
    daily_rep_count: safeCount,
    daily_rep_date: today,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })

  if (error) {
    if (!isMissingColumnError(error.message)) {
      console.error('[db] setDailyRep:', error.message)
    }
    writeDailyRepsLocal(questionId, safeCount, today)
    notifyDailyRepsChanged()
    return { ok: false, error: error.message }
  }

  writeDailyRepsLocal(questionId, safeCount, today)
  notifyDailyRepsChanged()
  return { ok: true, error: null }
}

/**
 * Mark done on Daily: reps + daily log + schedule SR review for Sets 1-3 on first completion.
 */
export async function markDailyQuestionDone(
  questionId: number,
  repsTarget: number,
  questionSet?: number,
): Promise<{ ok: boolean; reviewScheduled: boolean; advancedDay?: number; daysSkipped?: number; error?: string | null }> {
  const repResult = await setDailyRep(questionId, repsTarget)
  if (!repResult.ok) return { ok: false, reviewScheduled: false, error: repResult.error }

  await markDailyCompleteToday(questionId)

  let reviewScheduled = false
  if (questionSet != null && questionSet >= 1 && questionSet <= 3) {
    const { data: existing } = await supabase
      .from('progress')
      .select('solved')
      .eq('user_id', USER_ID)
      .eq('question_id', questionId)
      .maybeSingle()

    if (!existing?.solved) {
      const err = await updateProgress(questionId, { solved: true })
      reviewScheduled = !err
    }
  }

  return { ok: true, reviewScheduled }
}

/** Merge localStorage rep counts into DB (runs each Daily load — idempotent). */
export async function syncDailyRepsFromLocal(): Promise<void> {
  if (typeof window === 'undefined') return
  const today = todayISOChicago()
  const local = readDailyRepsLocal(today)
  const ids = Object.entries(local).filter(([, n]) => n > 0)
  if (ids.length === 0) return

  for (const [qid, count] of ids) {
    const questionId = Number.parseInt(qid, 10)
    if (!Number.isFinite(questionId)) continue
    const { data: existing } = await supabase
      .from('progress')
      .select('daily_rep_count,daily_rep_date')
      .eq('user_id', USER_ID)
      .eq('question_id', questionId)
      .maybeSingle()

    const dbCount =
      normalizeRepDate(existing?.daily_rep_date) === today
        ? ((existing?.daily_rep_count as number | undefined) ?? 0)
        : 0
    if (count > dbCount) {
      await setDailyRep(questionId, count)
    }
  }
}

/** @deprecated use syncDailyRepsFromLocal */
export async function migrateDailyRepsFromLocal(): Promise<void> {
  return syncDailyRepsFromLocal()
}

/** Increment count when user gets Accepted on a Submit (tracked per app question id). */
export async function incrementAcSubmitCount(questionId: number) {
  const { data: existing, error: readErr } = await supabase
    .from('ac_submit_counts')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()
  if (readErr) {
    // Local/dev DB may not have this optional table yet; treat as no-op.
    if (isMissingTableError(readErr.message)) return
    console.error('[db] incrementAcSubmitCount:', readErr.message)
    return
  }
  const next = (existing?.count ?? 0) + 1
  const { error } = await supabase.from('ac_submit_counts').upsert(
    {
      user_id: USER_ID,
      question_id: questionId,
      count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' },
  )
  if (error) {
    if (isMissingTableError(error.message)) return
    console.error('[db] incrementAcSubmitCount:', error.message)
  }
}

export async function getAcSubmitCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('ac_submit_counts')
    .select('question_id, count')
    .eq('user_id', USER_ID)
  if (error) {
    if (isMissingTableError(error.message)) return {}
    console.error('[db] getAcSubmitCounts:', error.message)
    return {}
  }
  const out: Record<string, number> = {}
  for (const row of data || []) {
    out[String((row as { question_id: number }).question_id)] = (row as { count: number }).count
  }
  return out
}

/** Increment count when user gets a non-Accepted result on a Submit. */
export async function incrementWrongSubmitCount(questionId: number) {
  const { data: existing, error: readErr } = await supabase
    .from('wrong_submit_counts')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()
  if (readErr) {
    if (isMissingTableError(readErr.message)) return
    console.error('[db] incrementWrongSubmitCount:', readErr.message)
    return
  }
  const next = (existing?.count ?? 0) + 1
  const { error } = await supabase.from('wrong_submit_counts').upsert(
    {
      user_id: USER_ID,
      question_id: questionId,
      count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' },
  )
  if (error) {
    if (isMissingTableError(error.message)) return
    console.error('[db] incrementWrongSubmitCount:', error.message)
  }
}

export async function getWrongSubmitCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('wrong_submit_counts')
    .select('question_id, count')
    .eq('user_id', USER_ID)
  if (error) {
    if (isMissingTableError(error.message)) return {}
    console.error('[db] getWrongSubmitCounts:', error.message)
    return {}
  }
  const out: Record<string, number> = {}
  for (const row of data || []) {
    out[String((row as { question_id: number }).question_id)] = (row as { count: number }).count
  }
  return out
}

export async function updateProgress(questionId: number, data: any) {
  const { data: existing } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .single()

  let reviewCount = existing?.review_count ?? 0
  let nextReview = existing?.next_review ?? null
  let lastReviewed = existing?.last_reviewed ?? null

  if (data.solved === true && !existing?.solved) {
    reviewCount = 0
    const todayCT = todayISOChicago()
    // Use review_start_days from study_plan (set at plan creation) for the
    // first review delay. Fall back to hard default 14.
    // Never fall back to srInterval(0)=1 — that makes reviews appear the next day.
    const { data: planRow } = await supabase
      .from('study_plan').select('review_start_days').eq('user_id', USER_ID).maybeSingle()
    const planDays = (planRow?.review_start_days as number | null | undefined)
    const firstReviewDelay: number = planDays ?? 14
    nextReview = addDaysISO(todayCT, firstReviewDelay)
    lastReviewed = todayCT
    await logSolvedToday()
  }

  if (data.solved === false && existing?.solved) {
    reviewCount = 0
    nextReview = null
    lastReviewed = null
  }

  const lastDailyDone =
    data.last_daily_done !== undefined
      ? normalizeRepDate(data.last_daily_done)
      : normalizeRepDate(existing?.last_daily_done)
  const dailyRepCount =
    data.daily_rep_count !== undefined
      ? data.daily_rep_count
      : (existing?.daily_rep_count ?? 0)
  const dailyRepDate =
    data.daily_rep_date !== undefined
      ? normalizeRepDate(data.daily_rep_date)
      : normalizeRepDate(existing?.daily_rep_date)

  const { error: upsertErr } = await supabase.from('progress').upsert({
    user_id: USER_ID,
    question_id: questionId,
    solved: data.solved ?? existing?.solved ?? false,
    starred: data.starred ?? existing?.starred ?? false,
    notes: data.notes ?? existing?.notes ?? '',
    review_count: reviewCount,
    next_review: nextReview,
    last_reviewed: lastReviewed,
    last_daily_done: lastDailyDone,
    daily_rep_count: dailyRepCount,
    daily_rep_date: dailyRepDate,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })
  if (upsertErr) console.error('[db] updateProgress:', upsertErr.message)

  try {
    await syncStreakActivityFromGoals()
  } catch (e) {
    console.error('[db] syncStreakActivityFromGoals:', e)
  }
  return upsertErr?.message ?? null
}

export async function addMasteryRunEvent(questionId: number, count = 1) {
  const inserts = Array.from({ length: Math.max(1, count) }, () => ({
    user_id: USER_ID,
    question_id: questionId,
  }))
  const { error } = await supabase.from('mastery_run_events').insert(inserts)
  if (error) console.error('[db] addMasteryRunEvent:', error.message)
  return { ok: !error, error: error?.message ?? null }
}

export async function getMasteryRunsByQuestion(): Promise<Record<string, number>> {
  try {
    // Aggregate on the DB side so we transfer one row per question, not one per event.
    const { data, error } = await supabase
      .rpc('get_mastery_run_counts', { p_user_id: USER_ID })

    if (error) {
      // Transport error (offline / Supabase unreachable) — skip fallback, it'll fail too.
      if (isFetchTransportError(error.message)) return {}

      // Fallback: RPC might not exist yet — fetch raw events and count client-side.
      const { data: raw, error: rawErr } = await supabase
        .from('mastery_run_events')
        .select('question_id')
        .eq('user_id', USER_ID)
      if (rawErr) {
        // Only log unexpected errors; transport errors are silently ignored.
        if (!isFetchTransportError(rawErr.message)) {
          console.error('[db] getMasteryRunsByQuestion:', rawErr.message)
        }
        return {}
      }
      const out: Record<string, number> = {}
      for (const row of raw ?? []) {
        const id = String((row as any).question_id)
        out[id] = (out[id] ?? 0) + 1
      }
      return out
    }

    const out: Record<string, number> = {}
    for (const row of data ?? []) {
      out[String((row as any).question_id)] = Number((row as any).run_count)
    }
    return out
  } catch {
    // Unexpected throw from the Supabase client — degrade gracefully.
    return {}
  }
}

export async function resetMasteryRuns(questionIds?: number[]) {
  let query = supabase
    .from('mastery_run_events')
    .delete()
    .eq('user_id', USER_ID)

  if (questionIds && questionIds.length > 0) {
    query = query.in('question_id', questionIds)
  }

  const { error } = await query
  if (error) console.error('[db] resetMasteryRuns:', error.message)
  return { ok: !error, error: error?.message ?? null }
}

// ─── Activity & Solved Logs ───────────────────────────────────────────────────
export async function logSolvedToday() {
  // IMPORTANT: solved_log is used for Random-mode daily quota + streak checks.
  // It must be keyed by the same day definition as the rest of the app (Chicago),
  // otherwise the UI can show "done" while streak stays unticked (or vice versa).
  const today = todayISOChicago()
  const localToday = localTodayISO()

  const { data: ctRow } = await supabase
    .from('solved_log')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .single()

  // Back-compat: if a device previously logged using local day, carry that forward
  // into the Chicago-keyed row the first time we see it.
  let base = ctRow?.count ?? 0
  if (base === 0 && localToday !== today) {
    const { data: localRow } = await supabase
      .from('solved_log')
      .select('count')
      .eq('user_id', USER_ID)
      .eq('date', localToday)
      .maybeSingle()
    if (typeof localRow?.count === 'number' && localRow.count > 0) {
      base = localRow.count
    }
  }

  await supabase.from('solved_log').upsert({
    user_id: USER_ID,
    date: today,
    count: base + 1,
  }, { onConflict: 'user_id,date' })
}

/** Increment when a question is finished on the Daily page (not Learn). */
export async function logDailyDoneToday() {
  const today = todayISOChicago()
  const localToday = localTodayISO()

  const { data: ctRow } = await supabase
    .from('daily_log')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .single()

  let base = ctRow?.count ?? 0
  if (base === 0 && localToday !== today) {
    const { data: localRow } = await supabase
      .from('daily_log')
      .select('count')
      .eq('user_id', USER_ID)
      .eq('date', localToday)
      .maybeSingle()
    if (typeof localRow?.count === 'number' && localRow.count > 0) {
      base = localRow.count
    }
  }

  await supabase.from('daily_log').upsert({
    user_id: USER_ID,
    date: today,
    count: base + 1,
  }, { onConflict: 'user_id,date' })
}

/** Mark today's Daily block item complete — does not set Learn `solved`. */
export async function markDailyCompleteToday(questionId: number) {
  const today = todayISOChicago()
  const { data: existing } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()

  const alreadyToday = (existing?.last_daily_done as string | null) === today

  const base = progressUpsertBase(existing as Record<string, unknown> | null)
  const repCount = base.daily_rep_date === today ? (base.daily_rep_count ?? 0) : 0

  const { error: upsertErr } = await supabase.from('progress').upsert({
    user_id: USER_ID,
    question_id: questionId,
    ...base,
    last_daily_done: today,
    daily_rep_date: today,
    daily_rep_count: repCount,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })
  if (upsertErr) console.error('[db] markDailyCompleteToday:', upsertErr.message)

  if (!alreadyToday) {
    try {
      await logDailyDoneToday()
    } catch (e) {
      console.error('[db] logDailyDoneToday:', e)
    }
  }

  try {
    await syncStreakActivityFromGoals()
  } catch (e) {
    console.error('[db] syncStreakActivityFromGoals:', e)
  }
  return upsertErr?.message ?? null
}

export async function getTodayDailyDoneCount(): Promise<number> {
  const today = todayISOChicago()
  const { data: ctRow } = await supabase
    .from('daily_log')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .maybeSingle()

  if (typeof ctRow?.count === 'number') return ctRow.count

  const localToday = localTodayISO()
  if (localToday === today) return 0

  const { data: localRow } = await supabase
    .from('daily_log')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('date', localToday)
    .maybeSingle()

  const localCount = (localRow?.count ?? 0) as number
  if (localCount > 0) {
    await supabase.from('daily_log').upsert({
      user_id: USER_ID,
      date: today,
      count: localCount,
    }, { onConflict: 'user_id,date' })
    return localCount
  }
  return 0
}

export async function getActivityLog(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('activity_log')
    .select('date,count')
    .eq('user_id', USER_ID)

  const result: Record<string, number> = {}
  for (const row of data || []) {
    result[row.date] = row.count
  }
  return result
}

export async function getSolvedLog(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('solved_log')
    .select('date,count')
    .eq('user_id', USER_ID)

  const result: Record<string, number> = {}
  for (const row of data || []) {
    result[row.date] = row.count
  }
  return result
}

export async function getDailyLog(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('daily_log')
    .select('date,count')
    .eq('user_id', USER_ID)
  if (error) {
    if (isMissingTableError(error.message)) return {}
    console.error('[db] getDailyLog:', error.message)
    return {}
  }

  const result: Record<string, number> = {}
  for (const row of data || []) {
    result[row.date] = row.count
  }
  return result
}

export async function getTodaySolvedCount(): Promise<number> {
  const today = todayISOChicago()
  const { data: ctRow } = await supabase
    .from('solved_log')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .maybeSingle()

  if (typeof ctRow?.count === 'number') return ctRow.count

  // Back-compat: if a device previously wrote solved_log using local date,
  // read it once and migrate it forward so streak/quota reflect correctly.
  const localToday = localTodayISO()
  if (localToday === today) return 0

  const { data: localRow } = await supabase
    .from('solved_log')
    .select('count')
    .eq('user_id', USER_ID)
    .eq('date', localToday)
    .maybeSingle()

  const localCount = (localRow?.count ?? 0) as number
  if (localCount > 0) {
    await supabase.from('solved_log').upsert({
      user_id: USER_ID,
      date: today,
      count: localCount,
    }, { onConflict: 'user_id,date' })
  }

  return localCount
}

// ─── Visited Sets ─────────────────────────────────────────────────────────────
export async function getFcVisited(): Promise<Set<number>> {
  const { data } = await supabase
    .from('fc_visited')
    .select('question_ids')
    .eq('user_id', USER_ID)
    .single()
  return new Set(data?.question_ids ?? [])
}

export async function addFcVisited(questionId: number) {
  const visited = await getFcVisited()
  visited.add(questionId)
  await supabase.from('fc_visited').upsert({
    user_id: USER_ID,
    question_ids: [...visited],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

export async function getBehavioralVisited(): Promise<Set<number>> {
  const { data } = await supabase
    .from('behavioral_visited')
    .select('question_ids')
    .eq('user_id', USER_ID)
    .single()
  return new Set(data?.question_ids ?? [])
}

export async function addBehavioralVisited(questionId: number) {
  const visited = await getBehavioralVisited()
  visited.add(questionId)
  await supabase.from('behavioral_visited').upsert({
    user_id: USER_ID,
    question_ids: [...visited],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

export async function getGemsVisited(): Promise<Set<string>> {
  const { data } = await supabase
    .from('gems_visited')
    .select('card_ids')
    .eq('user_id', USER_ID)
    .single()
  return new Set(data?.card_ids ?? [])
}

export async function addGemsVisited(cardId: string) {
  const visited = await getGemsVisited()
  visited.add(cardId)
  await supabase.from('gems_visited').upsert({
    user_id: USER_ID,
    card_ids: [...visited],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

// ─── Study Plan ───────────────────────────────────────────────────────────────
export async function getStudyPlan() {
  const { data, error } = await supabase
    .from('study_plan')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') console.error('[db] getStudyPlan:', error.message)
  return data
}

export async function saveStudyPlan(plan: {
  start_date: string
  per_day: number
  question_order: number[]
  lock_code: string
  mode?: string
  review_start_days?: number
  plan_start_index?: number
  claimed_day_index?: number
}) {
  const row: Record<string, unknown> = {
    user_id: USER_ID,
    start_date: plan.start_date,
    per_day: plan.per_day,
    question_order: plan.question_order,
    lock_code: plan.lock_code,
    mode: plan.mode ?? 'flex',
    review_start_days: plan.review_start_days ?? 14,
    created_at: new Date().toISOString(),
  }
  if (plan.plan_start_index != null) row.plan_start_index = plan.plan_start_index
  if (plan.claimed_day_index != null) row.claimed_day_index = plan.claimed_day_index

  const { error } = await supabase.from('study_plan').upsert(row, { onConflict: 'user_id' })
  if (error) {
    if (isMissingColumnError(error.message)) {
      delete row.plan_start_index
      delete row.claimed_day_index
      const { error: retryErr } = await supabase.from('study_plan').upsert(row, { onConflict: 'user_id' })
      if (retryErr) console.error('[db] saveStudyPlan:', retryErr.message)
      return !retryErr
    }
    console.error('[db] saveStudyPlan:', error.message)
  }
  return !error
}

export async function clearStudyPlan() {
  const { error } = await supabase.from('study_plan').delete().eq('user_id', USER_ID)
  if (error) console.error('[db] clearStudyPlan:', error.message)
}

// ─── Daily Target ─────────────────────────────────────────────────────────────
export async function getDailyTarget(): Promise<{ target: number; lock_code: string }> {
  const { data } = await supabase
    .from('daily_target')
    .select('target,lock_code')
    .eq('user_id', USER_ID)
    .single()
  return data ?? { target: 0, lock_code: '' }
}

export async function setDailyTarget(target: number, lock_code: string) {
  await supabase.from('daily_target').upsert({
    user_id: USER_ID,
    target,
    lock_code,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

// ─── Practice Sessions ────────────────────────────────────────────────────────
export async function getPracticeSession(questionId: number, language: string) {
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .eq('language', language)
    .single()
  if (error && error.code !== 'PGRST116') console.error('[db] getPracticeSession:', error.message)
  return data
}

export async function savePracticeSession(questionId: number, language: string, code: string, result?: any) {
  const { error } = await supabase.from('practice_sessions').upsert({
    user_id: USER_ID,
    question_id: questionId,
    language,
    code,
    last_result: result ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id,language' })
  if (error) console.error('[db] savePracticeSession:', error.message)
}

/** Grind editor drafts — stored separately from practice sessions via language prefix. */
export async function getGrindSession(questionId: number, lang: 'python3' | 'cpp') {
  return getPracticeSession(questionId, `grind_${lang}`)
}

export async function saveGrindSession(questionId: number, lang: 'python3' | 'cpp', code: string) {
  return savePracticeSession(questionId, `grind_${lang}`, code)
}

// ─── Mock Sessions ────────────────────────────────────────────────────────────
export interface MockSessionRecord {
  id?: number
  date: string
  question_id?: number | null
  question_title?: string | null
  difficulty?: string | null
  outcome: string
  elapsed_seconds: number
  duration_seconds?: number
  created_at?: string
}

export async function getMockSessions(limit = 20): Promise<MockSessionRecord[]> {
  const { data, error } = await supabase
    .from('mock_sessions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTableError(error.message) || isFetchTransportError(error.message)) {
      return readLocalMockSessions().slice(0, limit)
    }
    console.error('[db] getMockSessions:', error.message)
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date: r.date || (r.created_at ? String(r.created_at).split('T')[0] : '') || '',
    question_id: r.question_id,
    question_title: r.question_title,
    difficulty: r.difficulty,
    outcome: r.outcome,
    elapsed_seconds: r.elapsed_seconds,
    duration_seconds: r.duration_seconds,
  }))
}

export async function saveMockSession(session: Omit<MockSessionRecord, 'id'>) {
  const localSession: MockSessionRecord = {
    date: session.date,
    question_id: session.question_id ?? null,
    question_title: session.question_title ?? null,
    difficulty: session.difficulty ?? null,
    outcome: session.outcome,
    elapsed_seconds: session.elapsed_seconds,
    duration_seconds: session.duration_seconds,
    created_at: session.created_at ?? new Date().toISOString(),
  }
  const { error } = await supabase.from('mock_sessions').insert({
    user_id: USER_ID,
    question_id: session.question_id ?? null,
    outcome: session.outcome,
    duration_minutes: session.duration_seconds != null
      ? Math.max(1, Math.round(session.duration_seconds / 60))
      : null,
    code: null,
    language: null,
    created_at: session.created_at ?? new Date().toISOString(),
  })
  if (error) {
    if (isMissingTableError(error.message) || isFetchTransportError(error.message)) {
      writeLocalMockSessions([localSession, ...readLocalMockSessions()])
      return true
    }
    console.error('[db] saveMockSession:', error.message)
  }
  return !error
}

export async function getAllPracticeSessions() {
  const { data } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('user_id', USER_ID)
  return data ?? []
}

// ─── Time Tracking ────────────────────────────────────────────────────────────
export async function addTimeSpent(questionId: number, seconds: number) {
  const { data } = await supabase
    .from('time_tracking')
    .select('seconds')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .single()

  await supabase.from('time_tracking').upsert({
    user_id: USER_ID,
    question_id: questionId,
    seconds: (data?.seconds ?? 0) + Math.round(seconds),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })
}

export async function getTimeTracking(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('time_tracking')
    .select('question_id,seconds')
    .eq('user_id', USER_ID)

  const result: Record<string, number> = {}
  for (const row of data || []) {
    result[String(row.question_id)] = row.seconds
  }
  return result
}

// ─── Interview Date ───────────────────────────────────────────────────────────
export async function getInterviewDate() {
  const { data } = await supabase
    .from('interview_date')
    .select('*')
    .eq('user_id', USER_ID)
    .single()
  return data
}

export async function setInterviewDate(target_date: string, company: string) {
  await supabase.from('interview_date').upsert({
    user_id: USER_ID,
    target_date,
    company,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

export async function clearInterviewDate() {
  await supabase.from('interview_date').delete().eq('user_id', USER_ID)
}

// ─── Reset ───────────────────────────────────────────────────────────────────

export async function resetAllProgress(): Promise<{ error?: string }> {
  // 1. Reset the progress table
  const { error } = await supabase
    .from('progress')
    .update({
      solved: false,
      review_count: 0,
      next_review: null,
      last_reviewed: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', USER_ID)

  if (error) return { error: error.message }

  // 2. Clear mastery run events so SR tier labels reset to zero
  await resetMasteryRuns()

  return {}
}

// ─── Spaced Repetition ───────────────────────────────────────────────────────
// srInterval is imported from utils.ts — single source of truth.

export async function completeReview(questionId: number) {
  const todayCT = todayISOChicago()
  const { data: existing, error: readErr } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()

  if (readErr) {
    console.error('[db] completeReview read:', readErr.message)
    return { error: readErr.message, review_count: 0, next_review: todayCT }
  }

  const base = progressUpsertBase(existing as Record<string, unknown> | null)
  const newCount = (base.review_count ?? 0) + 1
  const nextReview = addDaysISO(todayCT, srInterval(newCount))

  const { error: upsertErr } = await supabase.from('progress').upsert({
    user_id: USER_ID,
    question_id: questionId,
    ...base,
    solved: true,
    review_count: newCount,
    next_review: nextReview,
    last_reviewed: todayCT,
    review_carry_date: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })

  if (upsertErr) {
    if (isMissingColumnError(upsertErr.message)) {
      const { error: retryErr } = await supabase.from('progress').upsert({
        user_id: USER_ID,
        question_id: questionId,
        ...base,
        solved: true,
        review_count: newCount,
        next_review: nextReview,
        last_reviewed: todayCT,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,question_id' })
      if (retryErr) {
        console.error('[db] completeReview upsert:', retryErr.message)
        return { error: retryErr.message, review_count: newCount, next_review: nextReview }
      }
    } else {
      console.error('[db] completeReview upsert:', upsertErr.message)
      return { error: upsertErr.message, review_count: newCount, next_review: nextReview }
    }
  }

  try {
    await syncStreakActivityFromGoals()
  } catch (e) {
    console.error('[db] syncStreakActivityFromGoals:', e)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lm-progress-changed'))
  }

  return { review_count: newCount, next_review: nextReview }
}

export async function failReview(questionId: number) {
  const todayCT = todayISOChicago()
  const { data: existing, error: readErr } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('question_id', questionId)
    .maybeSingle()

  if (readErr) {
    console.error('[db] failReview read:', readErr.message)
    return { error: readErr.message, review_count: 0, next_review: todayCT }
  }

  const base = progressUpsertBase(existing as Record<string, unknown> | null)
  const newCount = 0
  const nextReview = addDaysISO(todayCT, srInterval(newCount))

  const { error: upsertErr } = await supabase.from('progress').upsert({
    user_id: USER_ID,
    question_id: questionId,
    ...base,
    solved: true,
    review_count: newCount,
    next_review: nextReview,
    last_reviewed: todayCT,
    review_carry_date: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })

  if (upsertErr) {
    if (isMissingColumnError(upsertErr.message)) {
      const { error: retryErr } = await supabase.from('progress').upsert({
        user_id: USER_ID,
        question_id: questionId,
        ...base,
        solved: true,
        review_count: newCount,
        next_review: nextReview,
        last_reviewed: todayCT,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,question_id' })
      if (retryErr) {
        console.error('[db] failReview upsert:', retryErr.message)
        return { error: retryErr.message, review_count: newCount, next_review: nextReview }
      }
    } else {
      console.error('[db] failReview upsert:', upsertErr.message)
      return { error: upsertErr.message, review_count: newCount, next_review: nextReview }
    }
  }

  try {
    await syncStreakActivityFromGoals()
  } catch (e) {
    console.error('[db] syncStreakActivityFromGoals:', e)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lm-progress-changed'))
  }

  return { review_count: newCount, next_review: nextReview }
}

// Recalculate next_review from last_reviewed for any record where
// next_review doesn't match last_reviewed + correct interval.
// Runs silently — fixes drift caused by timezone bugs or manual solves.
export async function recalibrateSRDates() {
  const { data } = await supabase
    .from('progress')
    .select('question_id,review_count,next_review,last_reviewed')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('last_reviewed', 'is', null)

  if (!data?.length) return

  const updates: Array<{ question_id: number; next_review: string }> = []

  for (const row of data) {
    // Skip review_count=0 rows — their next_review is set to the user's
    // configured review_start_days delay (14/21/30), not srInterval(0)=1.
    // Recalibrating would overwrite the custom delay with 1 day.
    if ((row.review_count ?? 0) === 0) continue

    const interval = srInterval(row.review_count ?? 0)
    const base = new Date(row.last_reviewed + 'T12:00:00') // noon local avoids DST edge
    base.setDate(base.getDate() + interval)
    const expected = localDateISO(base)
    // Fix in both directions: pull forward if overdue too soon (timezone drift),
    // or pull back if drifted to an unreasonably far future date (!== expected).
    if (row.next_review !== expected) {
      updates.push({ question_id: row.question_id, next_review: expected })
    }
  }

  for (const u of updates) {
    await supabase.from('progress').update({ next_review: u.next_review })
      .eq('user_id', USER_ID)
      .eq('question_id', u.question_id)
  }
}

// Fix existing review_count=0 rows whose next_review was set too soon
// (i.e. < review_start_days after last_reviewed) due to the old srInterval(0)=1 fallback.
// Called on daily page load — silently corrects drift without requiring the user to re-setup.
export async function fixFirstReviewDates(): Promise<void> {
  // Read the configured first-review delay from study_plan; fall back to 14
  const { data: planRow } = await supabase
    .from('study_plan').select('review_start_days').eq('user_id', USER_ID).maybeSingle()
  const planDays = (planRow?.review_start_days as number | null | undefined)
  const targetDelay: number = planDays ?? 14

  // Only rows where review_count=0 and next_review < last_reviewed + targetDelay
  const { data } = await supabase
    .from('progress')
    .select('question_id,last_reviewed,next_review,review_count')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .eq('review_count', 0)
    .not('last_reviewed', 'is', null)
    .not('next_review', 'is', null)

  if (!data?.length) return

  const updates: Array<{ question_id: number; next_review: string }> = []
  for (const row of data) {
    const expected = addDaysISO(row.last_reviewed as string, targetDelay)
    // Only push forward — never pull backward (don't override a legitimately far date)
    if ((row.next_review as string) < expected) {
      updates.push({ question_id: row.question_id as number, next_review: expected })
    }
  }

  for (const u of updates) {
    await supabase.from('progress').update({ next_review: u.next_review })
      .eq('user_id', USER_ID)
      .eq('question_id', u.question_id)
  }
}

function isReviewIncompleteOnDueDate(
  dueDate: string,
  lastReviewed: string | null | undefined,
): boolean {
  if (!lastReviewed) return true
  return lastReviewed < dueDate
}

/**
 * Roll incomplete reviews forward to today (Chicago), like daily catch-up.
 * Marks rolled items with review_carry_date so they bypass the daily SR cap.
 */
export async function rolloverIncompleteReviews(): Promise<void> {
  const today = todayISOChicago()
  const { data, error } = await supabase
    .from('progress')
    .select('question_id,next_review,last_reviewed')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('next_review', 'is', null)
    .lt('next_review', today)

  if (error) {
    if (!isMissingColumnError(error.message)) {
      console.error('[db] rolloverIncompleteReviews read:', error.message)
    }
    return
  }

  for (const row of data ?? []) {
    const dueDate = row.next_review as string
    if (!isReviewIncompleteOnDueDate(dueDate, row.last_reviewed as string | null)) continue

    const withCarry = { next_review: today, review_carry_date: today }
    const { error: upErr } = await supabase
      .from('progress')
      .update(withCarry)
      .eq('user_id', USER_ID)
      .eq('question_id', row.question_id)

    if (upErr && isMissingColumnError(upErr.message)) {
      await supabase
        .from('progress')
        .update({ next_review: today })
        .eq('user_id', USER_ID)
        .eq('question_id', row.question_id)
    } else if (upErr) {
      console.error('[db] rolloverIncompleteReviews update:', upErr.message)
    }
  }
}

type DueReviewRow = {
  question_id: number
  review_count: number
  next_review: string
  review_carry_date?: string | null
}

async function fetchDueReviewRows(includeCarryDate: boolean): Promise<{
  rows: DueReviewRow[]
  error: string | null
}> {
  const today = todayISOChicago()
  const cols = includeCarryDate
    ? 'question_id,next_review,review_count,review_carry_date'
    : 'question_id,next_review,review_count'
  const { data, error } = await supabase
    .from('progress')
    .select(cols)
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .lte('next_review', today)
    .order('next_review', { ascending: true })

  if (error) {
    return { rows: [], error: error.message }
  }
  return { rows: (data ?? []) as unknown as DueReviewRow[], error: null }
}

export async function getDueReviews(): Promise<Array<{ id: number; review_count: number; next_review: string }>> {
  await fixFirstReviewDates()
  await rolloverIncompleteReviews()
  const cap = await getUserRevisionCap()

  let { rows, error } = await fetchDueReviewRows(true)
  if (error && isMissingColumnError(error)) {
    await spreadOverdueReviews({ maxPerDay: cap })
    const fallback = await fetchDueReviewRows(false)
    rows = fallback.rows
    error = fallback.error
    if (error) {
      console.error('[db] getDueReviews:', error)
      return []
    }
    return rows.slice(0, cap).map(r => ({
      id: r.question_id,
      review_count: r.review_count,
      next_review: r.next_review,
      carried: false,
    }))
  }
  if (error) {
    console.error('[db] getDueReviews:', error)
    return []
  }

  const carried = rows.filter(r => !!r.review_carry_date)
  const natural = rows.filter(r => !r.review_carry_date)
  const due = [...carried, ...natural.slice(0, cap)]
  return due.map(r => ({
    id: r.question_id,
    review_count: r.review_count,
    next_review: r.next_review,
    carried: !!r.review_carry_date,
  }))
}

/**
 * SR schedule window (due + upcoming) without applying daily caps/spreading.
 * Useful for "do extra reviews" views (Pileup).
 */
export async function getSrScheduleWindow(daysAhead = 30): Promise<Array<{ id: number; review_count: number; next_review: string }>> {
  const today = todayISOChicago()
  const horizon = addDaysISO(today, Math.max(0, Math.floor(daysAhead)))
  const { data } = await supabase
    .from('progress')
    .select('question_id,next_review,review_count')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('next_review', 'is', null)
    .lte('next_review', horizon)
    .order('next_review', { ascending: true })
  return (data ?? []).map((r: any) => ({ id: r.question_id, review_count: r.review_count, next_review: r.next_review }))
}

/** All future scheduled reviews (after today), for preview timeline. */
export async function getUpcomingReviews(limit = 30): Promise<Array<{
  id: number
  review_count: number
  next_review: string
  last_reviewed: string | null
}>> {
  const today = todayISOChicago()
  const { data } = await supabase
    .from('progress')
    .select('question_id,next_review,review_count,last_reviewed')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('next_review', 'is', null)
    .gt('next_review', today)
    .order('next_review', { ascending: true })
    .limit(limit)
  return (data ?? []).map((r: any) => ({
    id: r.question_id,
    review_count: r.review_count ?? 0,
    next_review: r.next_review,
    last_reviewed: r.last_reviewed ?? null,
  }))
}

/** Review pipeline stats for the Reviews preview panel. */
export async function getReviewPipelineStats(): Promise<{
  inSystem: number
  dueToday: number
  upcoming30: number
  reviewStartDays: number
}> {
  const today = todayISOChicago()
  const horizon = addDaysISO(today, 30)
  const [{ count: inSystem }, { count: dueToday }, { count: upcoming30 }, planRes] = await Promise.all([
    supabase.from('progress').select('*', { count: 'exact', head: true }).eq('user_id', USER_ID).eq('solved', true).not('next_review', 'is', null),
    supabase.from('progress').select('*', { count: 'exact', head: true }).eq('user_id', USER_ID).eq('solved', true).lte('next_review', today),
    supabase.from('progress').select('*', { count: 'exact', head: true }).eq('user_id', USER_ID).eq('solved', true).gt('next_review', today).lte('next_review', horizon),
    supabase.from('study_plan').select('review_start_days').eq('user_id', USER_ID).maybeSingle(),
  ])
  return {
    inSystem: inSystem ?? 0,
    dueToday: dueToday ?? 0,
    upcoming30: upcoming30 ?? 0,
    reviewStartDays: Number(planRes.data?.review_start_days) || 14,
  }
}

/** Count SR reviews completed today (last_reviewed = today Chicago). */
export async function getReviewsCompletedToday(): Promise<number> {
  const today = todayISOChicago()
  const { count } = await supabase
    .from('progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('last_reviewed', today)
  return count ?? 0
}

function addDaysISO(baseISO: string, days: number) {
  const d = new Date(baseISO + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localDateISO(d)
}

function isWeekendChicago(dateISOChicago: string): boolean {
  const weekday = new Date(dateISOChicago + 'T12:00:00').toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  })
  return weekday === 'Sat' || weekday === 'Sun'
}

/** @deprecated Hard-coded fallback — prefer getUserRevisionCap() for real cap. */
export function getDailyReviewCapChicago(_dateISOChicago = todayISOChicago()): number {
  return 3 // kept for any legacy callers; real cap comes from getUserRevisionCap()
}

/** Read the user's configured daily review limit from user_settings (default 3). */
export async function getUserRevisionCap(): Promise<number> {
  const { data } = await supabase
    .from('user_settings')
    .select('revision_cap')
    .eq('user_id', USER_ID)
    .maybeSingle()
  const cap = (data as any)?.revision_cap as number | null | undefined
  return typeof cap === 'number' && cap > 0 ? cap : 3
}

/**
 * Keep SR sustainable by moving excess overdue reviews into future days.
 * This avoids "overdue" piles and enforces a soft daily cap.
 */
export async function spreadOverdueReviews(opts?: { maxPerDay?: number; horizonDays?: number }) {
  const maxPerDay = Math.max(1, Math.floor(opts?.maxPerDay ?? 5))
  const horizonDays = Math.max(7, Math.floor(opts?.horizonDays ?? 120))
  const today = todayISOChicago()

  const { data, error } = await supabase
    .from('progress')
    .select('question_id,next_review,review_count')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('next_review', 'is', null)
    .order('next_review', { ascending: true })

  if (error) {
    console.error('[db] spreadOverdueReviews:', error.message)
    return
  }

  const rows = (data ?? []) as Array<{ question_id: number; next_review: string; review_count: number }>
  if (!rows.length) return

  // Mastery signal: how many accepted submissions you have for this question.
  // When we have to choose what stays "today" under a small cap, prioritize lower mastery first.
  const { data: acRows, error: acErr } = await supabase
    .from('ac_submit_counts')
    .select('question_id,count')
    .eq('user_id', USER_ID)
    .in('question_id', rows.map(r => r.question_id))
  // Optional table; proceed without mastery weighting if missing.
  if (acErr && !isMissingTableError(acErr.message)) {
    console.error('[db] spreadOverdueReviews(ac_submit_counts):', acErr.message)
  }

  const acCountById: Record<string, number> = {}
  for (const r of acRows ?? []) {
    const qid = String((r as any).question_id)
    acCountById[qid] = Number((r as any).count ?? 0) || 0
  }

  // Count scheduled reviews per day across the horizon, including today's already-scheduled items.
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const day = r.next_review
    if (!day) continue
    counts[day] = (counts[day] ?? 0) + 1
  }

  const overdue = rows
    .filter(r => r.next_review <= today)
    .sort((a, b) => {
      // Lower mastery first (fewer ACs), then lower SR review_count (less stable), then older due date.
      const acA = acCountById[String(a.question_id)] ?? 0
      const acB = acCountById[String(b.question_id)] ?? 0
      if (acA !== acB) return acA - acB
      const rcA = a.review_count ?? 0
      const rcB = b.review_count ?? 0
      if (rcA !== rcB) return rcA - rcB
      if (a.next_review !== b.next_review) return a.next_review.localeCompare(b.next_review)
      return a.question_id - b.question_id
    })
  if (overdue.length <= maxPerDay) return

  const updates: Array<{ question_id: number; next_review: string }> = []

  // Keep the first maxPerDay items on today; push the rest forward.
  const toPush = overdue.slice(maxPerDay)
  for (const r of toPush) {
    // Remove from its current day count (since we'll move it).
    counts[r.next_review] = Math.max(0, (counts[r.next_review] ?? 1) - 1)

    let placed = false
    for (let offset = 1; offset <= horizonDays; offset++) {
      const day = addDaysISO(today, offset)
      // Use the same user-configured cap for every future day.
      if ((counts[day] ?? 0) < maxPerDay) {
        counts[day] = (counts[day] ?? 0) + 1
        updates.push({ question_id: r.question_id, next_review: day })
        placed = true
        break
      }
    }

    // Worst case: push to the end of the horizon.
    if (!placed) {
      const day = addDaysISO(today, horizonDays + 1)
      counts[day] = (counts[day] ?? 0) + 1
      updates.push({ question_id: r.question_id, next_review: day })
    }
  }

  for (const u of updates) {
    await supabase
      .from('progress')
      .update({ next_review: u.next_review })
      .eq('user_id', USER_ID)
      .eq('question_id', u.question_id)
  }
}

/**
 * Re-place all upcoming reviews (today + next horizonDays) using the current cap.
 * Fixes the case where reviews were spread with an old, smaller cap and are now
 * sitting far in the future even though today has spare capacity.
 */
export async function rebalanceReviews(horizonDays = 60): Promise<void> {
  // Calibrate SR dates BEFORE spreading so we spread the correct base dates,
  // not dates that were already moved by a previous rebalance.
  await recalibrateSRDates()
  const userCap = await getUserRevisionCap()
  const today = todayISOChicago()
  const horizonDate = addDaysISO(today, horizonDays)

  // All reviews up to and including the horizon (overdue + future-within-window)
  const { data } = await supabase
    .from('progress')
    .select('question_id,next_review,review_count,review_carry_date')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('next_review', 'is', null)
    .lte('next_review', horizonDate)
    .order('next_review', { ascending: true })

  const rows = (data ?? []) as Array<{
    question_id: number
    next_review: string
    review_count: number
    review_carry_date?: string | null
  }>
  if (!rows.length) return

  // Seed counts with reviews already beyond the horizon (they hold their slot)
  const { data: beyond } = await supabase
    .from('progress')
    .select('question_id,next_review')
    .eq('user_id', USER_ID)
    .eq('solved', true)
    .not('next_review', 'is', null)
    .gt('next_review', horizonDate)

  const counts: Record<string, number> = {}
  for (const r of beyond ?? []) {
    const day = (r as any).next_review as string
    if (day) counts[day] = (counts[day] ?? 0) + 1
  }

  const updates: Array<{ question_id: number; next_review: string }> = []

  for (const row of rows) {
    // Carried-forward reviews stay on their assigned day until completed.
    if (row.review_carry_date) {
      const day = row.next_review
      if (day) counts[day] = (counts[day] ?? 0) + 1
      continue
    }

    let placed = false
    // Search from today forward for the earliest day with capacity
    for (let offset = 0; offset <= horizonDays + 60; offset++) {
      const day = addDaysISO(today, offset)
      if ((counts[day] ?? 0) < userCap) {
        counts[day] = (counts[day] ?? 0) + 1
        if (row.next_review !== day) {
          updates.push({ question_id: row.question_id, next_review: day })
        }
        placed = true
        break
      }
    }
    if (!placed) {
      const day = addDaysISO(today, horizonDays + 61)
      counts[day] = (counts[day] ?? 0) + 1
      updates.push({ question_id: row.question_id, next_review: day })
    }
  }

  for (const u of updates) {
    await supabase
      .from('progress')
      .update({ next_review: u.next_review })
      .eq('user_id', USER_ID)
      .eq('question_id', u.question_id)
  }
}

/** Same rules as streak: today's active daily block solved; clear due SR reviews too.
 *  @param modeOverride  Pass the plan mode explicitly when known (e.g. from daily page state).
 *                       Falls back to localStorage → plan.mode → 'strict'. */
export async function syncStreakActivityFromGoals(modeOverride?: string): Promise<void> {
  const today = todayISOChicago()

  // Read mode synchronously before any awaits (localStorage available on client).
  // modeOverride wins if provided by the caller (most reliable when on the daily page).
  const localMode = typeof window !== 'undefined'
    ? (localStorage.getItem('lm_plan_mode_v1') ?? null)
    : null

  const [plan, dueReviews, progressRaw, dailyDoneToday] = await Promise.all([
    getStudyPlan(),
    getDueReviews(),
    getProgress(),
    getTodayDailyDoneCount(),
  ])
  const progress = progressRaw ?? {}
  const dueCount = dueReviews.length

  // Priority: explicit override → localStorage → plan.mode from DB → 'strict'
  const mode = modeOverride ?? localMode ?? (plan as any)?.mode ?? 'strict'

  let repsPerQ = 2
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('lm_reps_per_q')
      const n = Number.parseInt(raw ?? '2', 10)
      if (Number.isFinite(n) && n > 0) repsPerQ = n
    } catch {}
  }

  const goalsMet = computeDailyGoalsMetToday(plan, progress, dueCount, {
    mode,
    dailyDoneTodayCount: dailyDoneToday,
    dailyReps: dailyRepsFromProgress(progress, today),
    repsPerQ,
  })

  if (goalsMet) {
    const { error } = await supabase.from('activity_log').upsert({
      user_id: USER_ID,
      date: today,
      count: 1,
    }, { onConflict: 'user_id,date' })
    if (error) console.error('[db] syncStreak: activity_log upsert failed:', error.message)
  }
}

// ─── User Profile (review settings) ─────────────────────────────────────────

export interface UserProfile {
  timezone?: string
  reviewStartDays?: number
  revisionCap?: number
  repsPerQ?: number
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('revision_cap')
    .eq('user_id', USER_ID)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error.message) || isMissingColumnError(error.message)) return null
    console.error('[db] getUserProfile:', error.message)
    return null
  }
  if (!data) return null
  const row = data as Record<string, unknown>
  return {
    timezone:        'America/Chicago',
    reviewStartDays: 14,
    revisionCap:     (row.revision_cap as number | undefined) ?? 3,
    repsPerQ:        2,
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<boolean> {
  const payload: Record<string, unknown> = {
    user_id: USER_ID,
    updated_at: new Date().toISOString(),
  }
  if (profile.revisionCap !== undefined) payload.revision_cap = profile.revisionCap

  const { error } = await supabase
    .from('user_settings')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) {
    if (isMissingTableError(error.message) || isMissingColumnError(error.message)) return false
    console.error('[db] saveUserProfile:', error.message)
    return false
  }
  return true
}

// ─── Saved Cycles (multi-cycle library, persists until the user deletes them) ────

export interface SavedCycle {
  id:         string                           // uuid
  name:       string                           // user-given label
  rangeLabel: string                           // e.g. "High Easy (43)" or "Custom 1–10"
  range:      { start: number; end: number }   // indices in study order
  reps:       number                           // total laps completed in this cycle
  cyclePos?:  number                           // steps taken in current lap
  cycleIdx?:  number                           // last question index in study order (filtered)
  cycleAccepted?: number[]                     // question IDs accepted this lap
  cycleOrderedIds?: number[]                   // full lap question IDs (locked at cycle start)
  createdAt:  string                           // ISO timestamp
}

export async function getSavedCycles(): Promise<SavedCycle[]> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_cycles')
    .eq('user_id', USER_ID)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error.message) || isMissingColumnError(error.message)) return []
    console.error('[db] getSavedCycles:', error.message)
    return []
  }
  try {
    const raw = (data as Record<string, unknown>)?.user_cycles as string | null
    return raw ? (JSON.parse(raw) as SavedCycle[]) : []
  } catch { return [] }
}

export async function setSavedCycles(cycles: SavedCycle[]): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: USER_ID, updated_at: new Date().toISOString(), user_cycles: JSON.stringify(cycles) }, { onConflict: 'user_id' })
  if (error) {
    if (isMissingTableError(error.message) || isMissingColumnError(error.message)) return
    console.error('[db] setSavedCycles:', error.message)
  }
}

// ─── Learn Cycle State (persisted per user so it survives tab close / device switch) ──

export interface CycleState {
  cycleRange:      { start: number; end: number } | null
  cycleReps:       number
  cyclePos:        number
  cycleIdx?:       number      // last visited index within filtered list
  cycleAccepted:   number[]    // question IDs accepted in current lap
  cycleOrderedIds?: number[]   // question IDs in the current lap's traversal order
  writtenAt?:      number      // unix ms — last-write-wins when picking between local/remote
}

export function clampCycleIdx(
  idx: number | undefined | null,
  range: { start: number; end: number },
): number {
  if (typeof idx !== 'number' || !Number.isFinite(idx)) return range.start
  return Math.max(range.start, Math.min(idx, range.end))
}

const CYCLE_STATE_LOCAL_KEY = 'lm_cycle_state_v1'

function readLocalCycleState(): CycleState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CYCLE_STATE_LOCAL_KEY)
    return raw ? (JSON.parse(raw) as CycleState) : null
  } catch {
    return null
  }
}

function writeLocalCycleState(state: CycleState | null) {
  if (typeof window === 'undefined') return
  try {
    if (state) localStorage.setItem(CYCLE_STATE_LOCAL_KEY, JSON.stringify(state))
    else localStorage.removeItem(CYCLE_STATE_LOCAL_KEY)
  } catch {}
}

function cycleRangesEqual(
  a: { start: number; end: number } | null | undefined,
  b: { start: number; end: number } | null | undefined,
): boolean {
  if (!a || !b) return false
  return a.start === b.start && a.end === b.end
}

async function syncSavedCycleProgress(state: CycleState): Promise<void> {
  if (!state.cycleRange) return
  const cycles = await getSavedCycles()
  let changed = false
  const next = cycles.map(c => {
    if (!cycleRangesEqual(c.range, state.cycleRange)) return c
    changed = true
    return {
      ...c,
      reps: state.cycleReps,
      cyclePos: state.cyclePos,
      cycleIdx: state.cycleIdx,
      cycleAccepted: state.cycleAccepted,
      cycleOrderedIds: state.cycleOrderedIds,
    }
  })
  if (changed) await setSavedCycles(next)
}

function cycleStateScore(state: CycleState | null | undefined): number {
  if (!state?.cycleRange) return -1
  return (state.cycleReps ?? 0) * 10_000 + (state.cycleAccepted?.length ?? 0)
}

function mergeCycleAcceptedIds(...lists: (number[] | undefined)[]): number[] {
  const ids = new Set<number>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const id of list) {
      if (typeof id === 'number' && Number.isFinite(id)) ids.add(id)
    }
  }
  return [...ids]
}

function pickBestCycleState(local: CycleState | null, remote: CycleState | null): CycleState | null {
  if (!local?.cycleRange) return remote
  if (!remote?.cycleRange) return local
  if (!cycleRangesEqual(local.cycleRange, remote.cycleRange)) {
    return cycleStateScore(local) >= cycleStateScore(remote) ? local : remote
  }
  // Same range — last write wins. writtenAt is stamped on every saveCycleState call.
  // This prevents a stale Supabase read (higher reps) from beating a fresh local reset (lower reps).
  const localAt  = local.writtenAt  ?? 0
  const remoteAt = remote.writtenAt ?? 0
  if (localAt !== remoteAt) {
    return localAt > remoteAt ? local : remote
  }
  // No timestamps (legacy state) — fall back to higher score
  const localReps = local.cycleReps ?? 0
  const remoteReps = remote.cycleReps ?? 0
  if (localReps !== remoteReps) {
    return localReps > remoteReps ? local : remote
  }
  const winner = cycleStateScore(local) >= cycleStateScore(remote) ? local : remote
  const other = winner === local ? remote : local
  const mergedAccepted = mergeCycleAcceptedIds(winner.cycleAccepted, other.cycleAccepted)
  const richer = (local.cycleAccepted?.length ?? 0) >= (remote.cycleAccepted?.length ?? 0) ? local : remote
  return {
    ...winner,
    cycleAccepted: mergedAccepted,
    cyclePos: richer.cyclePos ?? winner.cyclePos,
    cycleIdx: richer.cycleIdx ?? winner.cycleIdx,
    cycleOrderedIds: winner.cycleOrderedIds ?? richer.cycleOrderedIds,
  }
}

async function enrichCycleStateFromSavedCycles(state: CycleState): Promise<CycleState> {
  try {
    const cycles = await getSavedCycles()
    const match = cycles.find(c => cycleRangesEqual(c.range, state.cycleRange))
    if (!match) return state
    if ((match.reps ?? 0) !== (state.cycleReps ?? 0)) return state
    const merged = mergeCycleAcceptedIds(state.cycleAccepted, match.cycleAccepted)
    if (merged.length <= (state.cycleAccepted?.length ?? 0)) return state
    // Guard: if the merge would reach or exceed the cycle's total question count, the
    // SavedCycle is holding a prior lap's completed-list — don't import it into what is
    // supposed to be a fresh lap (would cause checkCycleLapComplete to fire immediately).
    const cycleLen = match.range.end - match.range.start + 1
    if (merged.length >= cycleLen) return state
    return {
      ...state,
      cycleAccepted: merged,
      cyclePos: match.cyclePos ?? state.cyclePos,
      cycleIdx: match.cycleIdx ?? state.cycleIdx,
      cycleOrderedIds: state.cycleOrderedIds ?? match.cycleOrderedIds,
    }
  } catch {
    return state
  }
}

function enrichOrderFromSessionStorage(state: CycleState | null): CycleState | null {
  if (!state?.cycleRange) return state
  if (Array.isArray(state.cycleOrderedIds) && state.cycleOrderedIds.length > 0) return state
  if (typeof window === 'undefined') return state
  try {
    const raw = sessionStorage.getItem('lm_learn_cycle_order')
    if (!raw) return state
    const order = JSON.parse(raw) as number[]
    const expectedLen = state.cycleRange.end - state.cycleRange.start + 1
    if (Array.isArray(order) && order.length === expectedLen) {
      return { ...state, cycleOrderedIds: order }
    }
  } catch { /* ignore */ }
  return state
}

function enrichFromSessionStorage(state: CycleState | null): CycleState | null {
  if (!state?.cycleRange || typeof window === 'undefined') return state
  let next = enrichOrderFromSessionStorage(state)
  if (!next) return state
  try {
    const raw = sessionStorage.getItem('lm_learn_cycle_accepted')
    if (!raw) return next
    const sess = JSON.parse(raw) as number[]
    if (!Array.isArray(sess)) return next
    const merged = mergeCycleAcceptedIds(next.cycleAccepted, sess)
    if (merged.length <= (next.cycleAccepted?.length ?? 0)) return next
    // Guard: same as enrichCycleStateFromSavedCycles — don't let stale session IDs
    // from a completed lap inflate the accepted count enough to fire lap completion.
    const cycleLen = next.cycleRange!.end - next.cycleRange!.start + 1
    if (merged.length >= cycleLen) return next
    return { ...next, cycleAccepted: merged }
  } catch {
    return next
  }
}

export async function getCycleState(): Promise<CycleState | null> {
  const local = readLocalCycleState()
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('cycle_state')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (error) {
      if (!isMissingTableError(error.message) && !isMissingColumnError(error.message)) {
        console.error('[db] getCycleState:', error.message)
      }
      let fallback = enrichFromSessionStorage(local)
      if (fallback?.cycleRange) fallback = await enrichCycleStateFromSavedCycles(fallback)
      return fallback
    }
    if (!data) {
      let fallback = enrichFromSessionStorage(local)
      if (fallback?.cycleRange) fallback = await enrichCycleStateFromSavedCycles(fallback)
      return fallback
    }
    const raw = (data as Record<string, unknown>).cycle_state as string | null
    if (!raw) {
      let fallback = enrichFromSessionStorage(local)
      if (fallback?.cycleRange) fallback = await enrichCycleStateFromSavedCycles(fallback)
      return fallback
    }
    const remote = JSON.parse(raw) as CycleState
    let best = pickBestCycleState(local, remote)
    best = enrichFromSessionStorage(best)
    if (best?.cycleRange) best = await enrichCycleStateFromSavedCycles(best)
    writeLocalCycleState(best)
    if (best && cycleStateScore(best) > cycleStateScore(remote)) {
      saveCycleState(best).catch(() => {})
    }
    return best
  } catch {
    let fallback = enrichFromSessionStorage(local)
    if (fallback?.cycleRange) fallback = await enrichCycleStateFromSavedCycles(fallback)
    return fallback
  }
}

export async function saveCycleState(state: CycleState | null): Promise<void> {
  if (state) state = { ...state, writtenAt: Date.now() }
  writeLocalCycleState(state)

  const payload: Record<string, unknown> = {
    user_id:     USER_ID,
    updated_at:  new Date().toISOString(),
    cycle_state: state ? JSON.stringify(state) : null,
  }
  const { error } = await supabase
    .from('user_settings')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) {
    if (!isMissingTableError(error.message) && !isMissingColumnError(error.message)) {
      console.error('[db] saveCycleState:', error.message)
    }
  }

  if (state?.cycleRange) {
    await syncSavedCycleProgress(state)
  }
}

// ─── Pattern FC Visited ───────────────────────────────────────────────────────
export async function getPatternFcVisited(): Promise<Set<number>> {
  const { data } = await supabase
    .from('pattern_fc_visited')
    .select('question_ids')
    .eq('user_id', USER_ID)
    .single()
  return new Set(data?.question_ids ?? [])
}

export async function addPatternFcVisited(questionId: number) {
  const visited = await getPatternFcVisited()
  visited.add(questionId)
  await supabase.from('pattern_fc_visited').upsert({
    user_id: USER_ID,
    question_ids: [...visited],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

// ─── FC Daily Log ─────────────────────────────────────────────────────────────
export async function logFlashcardViewToday(questionId: number) {
  // Use the same "day" definition app-wide (Chicago).
  const today = todayISOChicago()
  const { data } = await supabase
    .from('fc_daily_log')
    .select('question_ids')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .single()

  const ids = new Set<number>(data?.question_ids ?? [])
  if (!ids.has(questionId)) {
    ids.add(questionId)
    await supabase.from('fc_daily_log').upsert({
      user_id: USER_ID,
      date: today,
      question_ids: [...ids],
    }, { onConflict: 'user_id,date' })
  }
}

export async function getTodayFcCount(): Promise<number> {
  // Use the same "day" definition app-wide (Chicago).
  const today = todayISOChicago()
  const { data } = await supabase
    .from('fc_daily_log')
    .select('question_ids')
    .eq('user_id', USER_ID)
    .eq('date', today)
    .single()
  return (data?.question_ids ?? []).length
}
