import type { GrindQuestion } from './grindQuestions'
import {
  dailyRepsFromProgress,
  isCatchUpDailyCleared,
  isPlanDayComplete,
  isQuestionDoneForDailyToday,
  type DailyProgressSlice,
} from './dailyCompletion'
import { isActiveDailyBlockComplete } from './streakGoals'
import type { FlexStudyPlan } from './planFlex'
import { diffDaysSincePlanStart, todayISOChicago } from './studyPlanDay'

export type StudyPlan = FlexStudyPlan

function dayScheduledISO(startDate: string, dayIdx: number): string {
  const d = new Date(startDate + 'T12:00:00')
  d.setDate(d.getDate() + dayIdx)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function getDayQuestionIds(plan: StudyPlan, dayIndex: number): number[] {
  const start = plan.per_day * dayIndex
  return plan.question_order
    .slice(start, start + plan.per_day)
    .filter(id => Number.isFinite(id) && id > 0)
}

/** True when every question in the plan order is cleared (daily or solved). */
export function isPlanFullyComplete(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
  dailyReps?: Record<string, number>,
): boolean {
  if (plan.question_order.length === 0) return true
  const today = todayISOChicago()
  return plan.question_order.every(id =>
    !!progress[String(id)]?.solved ||
    isCatchUpDailyCleared(id, '1970-01-01', progress, today, dailyReps, repsPerQ),
  )
}

/** Last plan day index that still has at least one question. */
export function getLastPlanDayIndex(plan: StudyPlan): number {
  if (plan.question_order.length === 0) return 0
  return Math.floor((plan.question_order.length - 1) / plan.per_day)
}

export function getCalendarDayIndex(plan: StudyPlan): number {
  return diffDaysSincePlanStart(plan.start_date)
}

function getStartDayIndex(plan: StudyPlan): number {
  return Math.floor((plan.planStartIndex ?? 0) / plan.per_day)
}

function getClaimedDayIndex(plan: StudyPlan): number {
  const lastDay = getLastPlanDayIndex(plan)
  const claimed = plan.claimedDayIndex ?? 0
  return Math.min(Math.max(0, claimed), lastDay)
}

/** Questions before plan_start_index that were skipped when joining mid-plan. */
export function getPreStartCatchUpIds(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
  dailyReps?: Record<string, number>,
): number[] {
  const startIdx = plan.planStartIndex ?? 0
  if (startIdx <= 0) return []
  const today = todayISOChicago()
  const ids = plan.question_order.slice(0, startIdx)
  return ids.filter(id =>
    !isCatchUpDailyCleared(id, '1970-01-01', progress, today, dailyReps, repsPerQ),
  )
}

export function getPushedForwardIds(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  calendarDayIndex: number,
  repsPerQ: number,
  dailyReps?: Record<string, number>,
): number[] {
  const mode = plan.mode ?? 'strict'
  if (mode === 'random') return []

  const today = todayISOChicago()
  const result: number[] = []
  const startDay = getStartDayIndex(plan)
  const claimedDay = getClaimedDayIndex(plan)
  const loopEnd = claimedDay

  for (let i = startDay; i < loopEnd; i++) {
    const dayIds = getDayQuestionIds(plan, i)
    const scheduledDate = dayScheduledISO(plan.start_date, i)
    const pastDayComplete = isPlanDayComplete(
      i, dayIds, progress, claimedDay, today, dailyReps, repsPerQ,
      { flexMode: true },
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
  _progress: Record<string, DailyProgressSlice | undefined>,
  _repsPerQ: number,
  _dailyReps?: Record<string, number>,
): number {
  return getClaimedDayIndex(plan)
}

/** Next N question ids after today's block (flex "do more"). */
export function getNextPlanQuestionIds(
  plan: StudyPlan,
  afterDayIndex: number,
  count: number,
): number[] {
  const start = (afterDayIndex + 1) * plan.per_day
  return plan.question_order.slice(start, start + count)
}

export type DailyQueueItem = {
  question: GrindQuestion
  kind: 'makeup' | 'today' | 'extra'
  done: boolean
  reps: number
  repsTarget: number
  scheduledDay?: number
}

export type DailyPlanMeta = {
  dayNumber: number
  totalDays: number
  perDay: number
  repsPerQ: number
  dailyBlockDone: boolean
  dayComplete: boolean
  makeupPending: number
  todayPending: number
  startDayNumber: number
  mode: string
  hasMore: boolean
  planComplete: boolean
}

export function buildDailyQueue(
  plan: StudyPlan,
  questions: GrindQuestion[],
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ = 2,
  opts?: {
    dailyDoneTodayCount?: number
    dueReviewCount?: number
    extraCount?: number
  },
): { items: DailyQueueItem[]; meta: DailyPlanMeta } {
  const today = todayISOChicago()
  const dailyReps = dailyRepsFromProgress(progress, today)
  const calendarDayIndex = getCalendarDayIndex(plan)
  const activeDay = getActiveDayIndex(plan, progress, repsPerQ, dailyReps)
  const todayIds = getDayQuestionIds(plan, activeDay)
  const preStart = getPreStartCatchUpIds(plan, progress, repsPerQ, dailyReps)
  const pushed = getPushedForwardIds(plan, progress, calendarDayIndex, repsPerQ, dailyReps)
  const todaySet = new Set(todayIds)
  const qById = new Map(questions.map(q => [q.id, q]))
  const totalDays = Math.ceil(plan.question_order.length / plan.per_day)
  const mode = plan.mode ?? 'flex'
  const planComplete = isPlanFullyComplete(plan, progress, repsPerQ, dailyReps)
  const lastDay = getLastPlanDayIndex(plan)

  const items: DailyQueueItem[] = []
  const seen = new Set<number>()

  const pushItem = (item: DailyQueueItem) => {
    if (seen.has(item.question.id)) return
    seen.add(item.question.id)
    items.push(item)
  }

  for (const id of [...preStart, ...pushed]) {
    if (todaySet.has(id)) continue
    const q = qById.get(id)
    if (!q) continue
    pushItem({
      question: q,
      kind: 'makeup',
      done: isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
      reps: dailyReps[String(id)] ?? progress[String(id)]?.daily_rep_count ?? 0,
      repsTarget: repsPerQ,
    })
  }

  for (const id of todayIds) {
    const q = qById.get(id)
    if (!q) continue
    pushItem({
      question: q,
      kind: 'today',
      done: isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
      reps: dailyReps[String(id)] ?? progress[String(id)]?.daily_rep_count ?? 0,
      repsTarget: repsPerQ,
      scheduledDay: activeDay + 1,
    })
  }

  const extraCount = opts?.extraCount ?? 0
  if (extraCount > 0 && mode === 'flex' && !planComplete && activeDay < lastDay) {
    const extraIds = getNextPlanQuestionIds(plan, activeDay, extraCount)
    for (const id of extraIds) {
      const q = qById.get(id)
      if (!q) continue
      pushItem({
        question: q,
        kind: 'extra',
        done: isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
        reps: dailyReps[String(id)] ?? progress[String(id)]?.daily_rep_count ?? 0,
        repsTarget: repsPerQ,
        scheduledDay: activeDay + 1 + Math.ceil(extraIds.indexOf(id) / plan.per_day),
      })
    }
  }

  const makeupPending = items.filter(i => i.kind === 'makeup' && !i.done).length
  const todayPending = items.filter(i => (i.kind === 'today' || i.kind === 'extra') && !i.done).length
  const dailyBlockDone = isActiveDailyBlockComplete(plan, progress, {
    mode: plan.mode,
    dailyDoneTodayCount: opts?.dailyDoneTodayCount ?? 0,
    dailyReps,
    repsPerQ,
  })

  const nextBlockStart = (activeDay + 1) * plan.per_day
  const hasMore = !planComplete && activeDay < lastDay && nextBlockStart < plan.question_order.length

  return {
    items,
    meta: {
      dayNumber: activeDay + 1,
      totalDays,
      perDay: plan.per_day,
      repsPerQ,
      dailyBlockDone,
      dayComplete: dailyBlockDone && (opts?.dueReviewCount ?? 0) === 0,
      makeupPending,
      todayPending,
      startDayNumber: getStartDayIndex(plan) + 1,
      mode,
      hasMore,
      planComplete,
    },
  }
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

/** After today's block is all marked done, bump claimed plan day to the next day. */
export async function advancePlanDayIfTodayBlockDone(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
): Promise<{ advanced: boolean; newDayNumber?: number }> {
  const today = todayISOChicago()
  const dailyReps = dailyRepsFromProgress(progress, today)
  const activeDay = getClaimedDayIndex(plan)
  const lastDay = getLastPlanDayIndex(plan)
  const todayIds = getDayQuestionIds(plan, activeDay)

  if (todayIds.length === 0 || activeDay >= lastDay) return { advanced: false }
  const allDone = todayIds.every(id =>
    isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
  )
  if (!allDone) return { advanced: false }

  const { persistPlanFlex } = await import('./planFlex')
  const newClaimed = activeDay + 1
  const ok = await persistPlanFlex(
    { planStartIndex: plan.planStartIndex ?? 0, claimedDayIndex: newClaimed },
    plan.per_day,
  )
  return ok ? { advanced: true, newDayNumber: newClaimed + 1 } : { advanced: false }
}

/** True when every question in today's suggested plan-day block is marked done. */
export function isTodayPlanBlockDone(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
): boolean {
  const today = todayISOChicago()
  const dailyReps = dailyRepsFromProgress(progress, today)
  const todayIds = getDayQuestionIds(plan, getClaimedDayIndex(plan))
  if (todayIds.length === 0) return false
  return todayIds.every(id =>
    isQuestionDoneForDailyToday(id, progress, today, dailyReps, repsPerQ),
  )
}

/** Advance through consecutive already-done plan days (e.g. after marking day 38 done, skip to 39, 40...). */
export async function advancePlanDayChain(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
): Promise<{ daysAdvanced: number; finalDayNumber: number }> {
  let currentPlan = plan
  let daysAdvanced = 0
  for (let i = 0; i < 60; i++) {
    const result = await advancePlanDayIfTodayBlockDone(currentPlan, progress, repsPerQ)
    if (!result.advanced || !result.newDayNumber) break
    daysAdvanced++
    currentPlan = {
      ...currentPlan,
      claimedDayIndex: result.newDayNumber - 1,
    }
  }
  return {
    daysAdvanced,
    finalDayNumber: getClaimedDayIndex(currentPlan) + 1,
  }
}

/** Manual: move to next plan day when today's block is done. */
export async function goToNextPlanDay(
  plan: StudyPlan,
  progress: Record<string, DailyProgressSlice | undefined>,
  repsPerQ: number,
): Promise<{ ok: boolean; newDayNumber?: number; error?: string }> {
  if (!isTodayPlanBlockDone(plan, progress, repsPerQ)) {
    return { ok: false, error: 'Mark all suggested questions done first' }
  }

  const activeDay = getClaimedDayIndex(plan)
  const lastDay = getLastPlanDayIndex(plan)
  if (activeDay >= lastDay) {
    return { ok: false, error: 'Already on the last plan day' }
  }

  const newClaimed = activeDay + 1
  const { persistPlanFlex } = await import('./planFlex')
  await persistPlanFlex(
    { planStartIndex: plan.planStartIndex ?? 0, claimedDayIndex: newClaimed },
    plan.per_day,
  )

  return { ok: true, newDayNumber: newClaimed + 1 }
}
