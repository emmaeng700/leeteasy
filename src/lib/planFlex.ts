/**
 * Flexible daily plan: pick where to start and which plan day is "today".
 * Pre-start questions become catch-up. Stored in DB when columns exist, else localStorage.
 */

import { parseQuestionOrder, type StudyPlanForStreak } from './studyPlanDay'

export type PlanFlexConfig = {
  planStartIndex: number
  claimedDayIndex: number
}

export type FlexStudyPlan = StudyPlanForStreak & PlanFlexConfig & {
  mode?: string
  review_start_days?: number
}

const LS_START = 'lm_plan_start_index'
const LS_CLAIMED = 'lm_claimed_day_index'

export function readPlanFlexLocal(): PlanFlexConfig {
  if (typeof window === 'undefined') {
    return { planStartIndex: 0, claimedDayIndex: 0 }
  }
  try {
    const start = Number.parseInt(localStorage.getItem(LS_START) ?? '0', 10)
    const claimed = Number.parseInt(localStorage.getItem(LS_CLAIMED) ?? '0', 10)
    return {
      planStartIndex: Number.isFinite(start) && start >= 0 ? start : 0,
      claimedDayIndex: Number.isFinite(claimed) && claimed >= 0 ? claimed : 0,
    }
  } catch {
    return { planStartIndex: 0, claimedDayIndex: 0 }
  }
}

export function writePlanFlexLocal(cfg: PlanFlexConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_START, String(Math.max(0, cfg.planStartIndex)))
  localStorage.setItem(LS_CLAIMED, String(Math.max(0, cfg.claimedDayIndex)))
}

/** Merge DB row + localStorage flex fields into one plan object. */
export function extendPlanWithFlex(raw: unknown): FlexStudyPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const qo = parseQuestionOrder(p.question_order)
  if (qo.length === 0) return null
  const perDay = Number(p.per_day)
  const startDate = String(p.start_date ?? '')
  if (!startDate || !Number.isFinite(perDay) || perDay < 1) return null

  const local = readPlanFlexLocal()
  const dbStart = Number(p.plan_start_index)
  const dbClaimed = Number(p.claimed_day_index)
  const lastDay = Math.floor((qo.length - 1) / perDay)

  const planStartIndex =
    Number.isFinite(dbStart) && dbStart >= 0 ? dbStart : local.planStartIndex
  const dbClaimedValid = Number.isFinite(dbClaimed) && dbClaimed >= 0 ? dbClaimed : null

  // Local is updated on every advance; DB may be stale or wrongly at the last day.
  let claimedDayIndex = local.claimedDayIndex
  if (
    claimedDayIndex === 0 &&
    dbClaimedValid != null &&
    dbClaimedValid > 0 &&
    dbClaimedValid < lastDay
  ) {
    claimedDayIndex = dbClaimedValid
    writePlanFlexLocal({ planStartIndex, claimedDayIndex })
  }

  return {
    start_date: startDate,
    per_day: perDay,
    question_order: qo,
    mode: 'flex',
    review_start_days: Number(p.review_start_days) || 14,
    planStartIndex,
    claimedDayIndex,
  }
}

export function dayToStartIndex(day1Based: number, perDay: number): number {
  return Math.max(0, (Math.max(1, day1Based) - 1) * perDay)
}

export function startIndexToDay(index: number, perDay: number): number {
  return Math.floor(Math.max(0, index) / perDay) + 1
}

export function totalPlanDays(questionCount: number, perDay: number): number {
  return Math.ceil(questionCount / perDay)
}

export function clampClaimedDay(claimedDayIndex: number, questionCount: number, perDay: number): number {
  if (questionCount === 0) return 0
  const lastWithQ = Math.floor((questionCount - 1) / perDay)
  return Math.min(Math.max(0, claimedDayIndex), lastWithQ)
}

export function clampStartIndex(startIndex: number, questionCount: number): number {
  return Math.min(Math.max(0, startIndex), Math.max(0, questionCount))
}

/** Backdate start_date so calendar day index matches claimed plan day. */
export function startDateForClaimedDay(claimedDayIndex: number): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const d = new Date(today + 'T12:00:00')
  d.setDate(d.getDate() - claimedDayIndex)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

export async function persistPlanFlex(cfg: PlanFlexConfig, perDay: number): Promise<boolean> {
  writePlanFlexLocal(cfg)
  try {
    const { saveStudyPlan, getStudyPlan } = await import('./db')
    const existing = await getStudyPlan()
    if (!existing) return true
    const orderLen = parseQuestionOrder(existing.question_order).length
    const claimed = clampClaimedDay(cfg.claimedDayIndex, orderLen, perDay)
    writePlanFlexLocal({ planStartIndex: cfg.planStartIndex, claimedDayIndex: claimed })
    void saveStudyPlan({
      start_date: startDateForClaimedDay(claimed),
      per_day: existing.per_day as number,
      question_order: parseQuestionOrder(existing.question_order),
      lock_code: String(existing.lock_code ?? ''),
      mode: 'flex',
      review_start_days: Number(existing.review_start_days) || 14,
      plan_start_index: cfg.planStartIndex,
      claimed_day_index: claimed,
    })
    return true
  } catch {
    return true
  }
}
