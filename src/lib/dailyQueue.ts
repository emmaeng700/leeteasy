import {
  dailyRepsFromProgress,
  isCatchUpDailyCleared,
  isPlanDayComplete,
  isQuestionDoneForDailyToday,
  normalizeRepDate,
  type DailyProgressSlice,
} from './dailyCompletion'
import { diffDaysSincePlanStart, todayISOChicago, type StudyPlanForStreak } from './studyPlanDay'
import type { Question } from './questions'

export type StudyPlan = StudyPlanForStreak & { mode?: string }

function dayScheduledISO(startDate: string, dayIdx: number): string {
  const d = new Date(startDate + 'T12:00:00')
  d.setDate(d.getDate() + dayIdx)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function getDayQuestionIds(plan: StudyPlan, dayIndex: number): number[] {
  const start = plan.per_day * dayIndex
  return plan.question_order.slice(start, start + plan.per_day)
}

export function getCalendarDayIndex(plan: StudyPlan): number {
  return diffDaysSincePlanStart(plan.start_date)
}

export function getPushedForwardIds(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  calendarDayIndex: number,
  repsPerQ: number,
  dailyReps?: Record<string, number>,
): number[] {
  if ((plan.mode ?? 'strict') === 'random') return []
  const today = todayISOChicago()
  const result: number[] = []
  for (let i = 0; i < calendarDayIndex; i++) {
    const dayIds = getDayQuestionIds(plan, i)
    const scheduledDate = dayScheduledISO(plan.start_date, i)
    const pastDayComplete = isPlanDayComplete(
      i, dayIds, progress, calendarDayIndex, today, dailyReps, repsPerQ,
    )
    if (pastDayComplete) continue
    for (const id of dayIds) {
      if (!isCatchUpDailyCleared(id, scheduledDate, progress, today, dailyReps, repsPerQ)) {
        result.push(id)
      }
    }
  }
  return result
}

export function getActiveDayIndex(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
  dailyReps?: Record<string, number>,
): number {
  const today = todayISOChicago()
  const diffDays = getCalendarDayIndex(plan)
  const totalDays = Math.ceil(plan.question_order.length / plan.per_day)
  if (diffDays < 0) return 0
  if (diffDays >= totalDays) return totalDays - 1

  let active = Math.min(diffDays, totalDays - 1)
  for (let i = 0; i <= Math.min(diffDays, totalDays - 1); i++) {
    const ids = getDayQuestionIds(plan, i)
    if (!isPlanDayComplete(i, ids, progress, diffDays, today, dailyReps, repsPerQ)) {
      active = i
      break
    }
  }
  return active
}

export type DailyQueueItem = {
  question: Question
  kind: 'makeup' | 'today'
  done: boolean
  reps: number
  repsTarget: number
}

export function buildDailyQueue(
  plan: StudyPlan,
  questions: Question[],
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ = 2,
): DailyQueueItem[] {
  const today = todayISOChicago()
  const dailyReps = dailyRepsFromProgress(progress, today)
  const calendarDayIndex = getCalendarDayIndex(plan)
  const activeDay = getActiveDayIndex(plan, progress, repsPerQ, dailyReps)
  const todayIds = getDayQuestionIds(plan, activeDay)
  const pushed = getPushedForwardIds(plan, progress, calendarDayIndex, repsPerQ, dailyReps)
  const todaySet = new Set(todayIds)

  const items: DailyQueueItem[] = []

  for (const id of pushed) {
    if (todaySet.has(id)) continue
    const q = questions.find(x => x.id === id)
    if (!q) continue
    items.push({
      question: q,
      kind: 'makeup',
      done: isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
      reps: dailyReps[String(id)] ?? progress[String(id)]?.daily_rep_count ?? 0,
      repsTarget: repsPerQ,
    })
  }

  for (const id of todayIds) {
    const q = questions.find(x => x.id === id)
    if (!q) continue
    items.push({
      question: q,
      kind: 'today',
      done: isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
      reps: dailyReps[String(id)] ?? progress[String(id)]?.daily_rep_count ?? 0,
      repsTarget: repsPerQ,
    })
  }

  return items
}

export function isQuestionDoneForDaily(
  id: number,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ = 2,
): boolean {
  const today = todayISOChicago()
  const dailyReps = dailyRepsFromProgress(progress, today)
  return isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ)
}

export function repsPerQuestion(): number {
  if (typeof window === 'undefined') return 2
  try {
    const n = Number.parseInt(localStorage.getItem('lm_reps_per_q') ?? '2', 10)
    return Number.isFinite(n) && n > 0 ? n : 2
  } catch {
    return 2
  }
}

export function lastDailyDoneToday(progress: Record<string, DailyProgressSlice | undefined>, id: number): boolean {
  return normalizeRepDate(progress[String(id)]?.last_daily_done) === todayISOChicago()
}
