/**
 * Daily block completion - independent of Learn progress.solved for today.
 * Past plan days still credit prior solved so you don't redo Day 1-7.
 * Today / catch-up = Daily reps on progress (DB) OR last_daily_done = today (DB).
 */

import { diffDaysSincePlanStart, todayISOChicago, type StudyPlanForStreak } from './studyPlanDay'

export const DAILY_REPS_PREFIX = 'lm_daily_reps_'
export const DAILY_REPS_CHANGED = 'lm-daily-reps-changed'

export function notifyDailyRepsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DAILY_REPS_CHANGED))
}

/** Supabase DATE / timestamps → YYYY-MM-DD for reliable === today checks. */
export function normalizeRepDate(d: unknown): string | null {
  if (d == null || d === '') return null
  const m = String(d).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export type DailyProgressSlice = {
  last_daily_done?: string | null
  daily_rep_count?: number
  daily_rep_date?: string | null
  solved?: boolean
}

/** Today's rep count for one question — DB progress row is source of truth. */
export function getDailyRepCount(
  id: number,
  progress: Record<string, DailyProgressSlice | undefined>,
  today = todayISOChicago(),
  dailyReps?: Record<string, number>,
): number {
  const row = progress[String(id)]
  let dbCount = 0
  const repCount = row?.daily_rep_count ?? 0
  if (normalizeRepDate(row?.daily_rep_date) === today && repCount > 0) {
    dbCount = repCount
  }
  const fromMap = dailyReps?.[String(id)]
  if (fromMap !== undefined && fromMap > dbCount) return fromMap
  const local = readDailyRepsLocal(today)[String(id)] ?? 0
  return Math.max(dbCount, local)
}

/** Map of question id → rep count for today, derived from progress rows. */
export function dailyRepsFromProgress(
  progress: Record<string, DailyProgressSlice | undefined>,
  today = todayISOChicago(),
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, row] of Object.entries(progress)) {
    const repCount = row?.daily_rep_count ?? 0
    if (normalizeRepDate(row?.daily_rep_date) === today && repCount > 0) {
      out[id] = repCount
    }
  }
  for (const [id, count] of Object.entries(readDailyRepsLocal(today))) {
    if (count > (out[id] ?? 0)) out[id] = count
  }
  return out
}

/** Legacy localStorage read — backup when DB sync lags (same device / offline). */
export function readDailyRepsLocal(today = todayISOChicago()): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(`${DAILY_REPS_PREFIX}${today}`) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/** Any localStorage daily-rep day on or after missed schedule with full reps (same device). */
function catchUpClearedInLocalStorage(id: number, missedDayScheduledISO: string, repsPerQ: number): boolean {
  if (typeof window === 'undefined') return false
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(DAILY_REPS_PREFIX)) continue
    const date = key.slice(DAILY_REPS_PREFIX.length)
    if (date < missedDayScheduledISO) continue
    try {
      const map = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>
      if ((map[String(id)] ?? 0) >= repsPerQ) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

export function writeDailyRepsLocal(questionId: number, count: number, today = todayISOChicago()) {
  if (typeof window === 'undefined') return
  const map = readDailyRepsLocal(today)
  map[String(questionId)] = count
  localStorage.setItem(`${DAILY_REPS_PREFIX}${today}`, JSON.stringify(map))
}

export function isQuestionDoneForDailyToday(
  id: number,
  progress: Record<string, DailyProgressSlice | undefined>,
  today = todayISOChicago(),
  dailyReps?: Record<string, number>,
  repsPerQ = 2,
): boolean {
  if (getDailyRepCount(id, progress, today, dailyReps) >= repsPerQ) return true
  return normalizeRepDate(progress[String(id)]?.last_daily_done) === today
}

/**
 * Missed-day catch-up: cleared if done for daily today OR daily-completed on any
 * later calendar date (last_daily_done after that day's scheduled date).
 */
export function isCatchUpDailyCleared(
  id: number,
  missedDayScheduledISO: string,
  progress: Record<string, DailyProgressSlice | undefined>,
  today = todayISOChicago(),
  dailyReps?: Record<string, number>,
  repsPerQ = 2,
): boolean {
  if (isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ)) return true
  const row = progress[String(id)]
  const lastDone = normalizeRepDate(row?.last_daily_done)
  if (lastDone && lastDone >= missedDayScheduledISO) {
    if (lastDone > missedDayScheduledISO) return true
    const repDate = normalizeRepDate(row?.daily_rep_date)
    const repCount = row?.daily_rep_count ?? 0
    if (repDate === lastDone && repCount >= repsPerQ) return true
  }
  const repDate = normalizeRepDate(row?.daily_rep_date)
  const repCount = row?.daily_rep_count ?? 0
  if (!!repDate && repDate > missedDayScheduledISO && repCount >= repsPerQ) return true
  return catchUpClearedInLocalStorage(id, missedDayScheduledISO, repsPerQ)
}

/** Whether a strict-plan day slot is cleared (past days vs today/catch-up). */
export function isPlanDayComplete(
  dayIndex: number,
  questionIds: number[],
  progress: Record<string, DailyProgressSlice | undefined>,
  calendarDiffDays: number,
  today = todayISOChicago(),
  dailyReps?: Record<string, number>,
  repsPerQ = 2,
): boolean {
  if (questionIds.length === 0) return true
  if (dayIndex < calendarDiffDays) {
    return questionIds.every(id => !!progress[String(id)]?.solved)
  }
  return questionIds.every(id =>
    isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
  )
}

/** First plan day (up to calendar today) that still has questions not done for today. */
export function findActiveDayIndex(
  plan: StudyPlanForStreak,
  progress: Record<string, DailyProgressSlice | undefined>,
  opts?: { dailyReps?: Record<string, number>; repsPerQ?: number; today?: string },
): { activeDayIndex: number; diffDays: number; totalDays: number } | null {
  const today = opts?.today ?? todayISOChicago()
  const repsPerQ = opts?.repsPerQ ?? 2
  const diffDays = diffDaysSincePlanStart(plan.start_date)
  if (diffDays < 0) return null

  const totalDays = Math.ceil(plan.question_order.length / plan.per_day)
  if (totalDays <= 0) return null

  if (diffDays >= totalDays) {
    return { activeDayIndex: totalDays - 1, diffDays, totalDays }
  }

  let activeDayIndex = Math.min(diffDays, totalDays - 1)
  for (let i = 0; i <= Math.min(diffDays, totalDays - 1); i++) {
    const slice = plan.question_order.slice(i * plan.per_day, i * plan.per_day + plan.per_day)
    if (!isPlanDayComplete(i, slice, progress, diffDays, today, opts?.dailyReps, repsPerQ)) {
      activeDayIndex = i
      break
    }
  }

  return { activeDayIndex, diffDays, totalDays }
}

export function getActiveDayQuestionIds(
  plan: StudyPlanForStreak,
  progress: Record<string, DailyProgressSlice | undefined>,
  opts?: { dailyReps?: Record<string, number>; repsPerQ?: number; today?: string },
): number[] {
  const meta = findActiveDayIndex(plan, progress, opts)
  if (!meta) return []
  const { activeDayIndex } = meta
  return plan.question_order.slice(
    activeDayIndex * plan.per_day,
    activeDayIndex * plan.per_day + plan.per_day,
  )
}

export function isActiveDailyBlockComplete(
  plan: StudyPlanForStreak,
  progress: Record<string, DailyProgressSlice | undefined>,
  opts?: {
    mode?: string
    /** Random mode: questions marked done on Daily today (daily_log). */
    dailyDoneTodayCount?: number
    /** @deprecated use dailyDoneTodayCount */
    solvedTodayCount?: number
    dailyReps?: Record<string, number>
    repsPerQ?: number
    today?: string
  },
): boolean {
  const mode = opts?.mode ?? plan.mode ?? 'strict'
  const today = opts?.today ?? todayISOChicago()
  const repsPerQ = opts?.repsPerQ ?? 2

  if (mode === 'random') {
    const count = opts?.dailyDoneTodayCount ?? opts?.solvedTodayCount ?? 0
    return count >= plan.per_day
  }

  const ids = getActiveDayQuestionIds(plan, progress, { dailyReps: opts?.dailyReps, repsPerQ, today })
  return ids.length > 0 && ids.every(id => isQuestionDoneForDailyToday(id, progress, today, opts?.dailyReps, repsPerQ))
}
