/**
 * Day-complete rules (app, streak, emails):
 * - Today's active daily questions must be done on the Daily flow (reps or last_daily_done).
 * - Learn `solved` does not count toward the daily block.
 * - If SR reviews are due today, clear them too before the day is complete.
 */

import {
  isActiveDailyBlockComplete,
} from './dailyCompletion'
import { diffDaysSincePlanStart, normalizeStudyPlanRow, type StudyPlanForStreak } from './studyPlanDay'

export type { StudyPlanForStreak }
export { normalizeStudyPlanRow } from './studyPlanDay'
export {
  isQuestionDoneForDailyToday,
  getActiveDayQuestionIds,
  isActiveDailyBlockComplete,
  dailyRepsFromProgress,
  getDailyRepCount,
} from './dailyCompletion'

export type DailyGoalsOpts = {
  mode?: string
  /** Random mode: questions finished on Daily today (daily_log). */
  dailyDoneTodayCount?: number
  /** @deprecated use dailyDoneTodayCount */
  solvedTodayCount?: number
  /** Strict mode: optional rep map override (defaults to progress.daily_rep_*). */
  dailyReps?: Record<string, number>
  repsPerQ?: number
}

/** Full day complete: daily block done for today, and no SR reviews left due today. */
export function isDayComplete(
  plan: unknown,
  progress: Record<string, { last_daily_done?: string | null } | undefined>,
  dueReviewCount: number,
  opts?: DailyGoalsOpts,
): boolean {
  const p = normalizeStudyPlanRow(plan)
  if (!p) return dueReviewCount === 0
  return isActiveDailyBlockComplete(p, progress, opts) && dueReviewCount === 0
}

function computePlanStreakCore(
  plan: StudyPlanForStreak,
  progress: Record<string, { last_daily_done?: string | null } | undefined>,
  dueReviewCount: number,
  opts?: DailyGoalsOpts,
): { goalsMet: boolean; streakNumber: number } {
  const diffDaysRaw = diffDaysSincePlanStart(plan.start_date)
  const diffDays = Number.isFinite(diffDaysRaw) ? diffDaysRaw : 0

  if (diffDays < 0) {
    return { goalsMet: false, streakNumber: 0 }
  }

  const goalsMet = isDayComplete(plan, progress, dueReviewCount, opts)
  const streakNumber = diffDays + (goalsMet ? 1 : 0)

  return { goalsMet, streakNumber }
}

export function computeDailyGoalsMetToday(
  plan: unknown,
  progress: Record<string, { last_daily_done?: string | null } | undefined>,
  dueReviewCount: number,
  opts?: DailyGoalsOpts,
): boolean {
  const p = normalizeStudyPlanRow(plan)
  if (!p) return dueReviewCount === 0
  return computePlanStreakCore(p, progress, dueReviewCount, opts).goalsMet
}

/** Headline streak when a study plan exists: completed “police” days in order (not activity_log). */
export function computePlanStreakDisplayNumber(
  plan: unknown,
  progress: Record<string, { last_daily_done?: string | null } | undefined>,
  dueReviewCount: number,
  opts?: DailyGoalsOpts,
): number | null {
  const p = normalizeStudyPlanRow(plan)
  if (!p) return null
  return computePlanStreakCore(p, progress, dueReviewCount, opts).streakNumber
}
