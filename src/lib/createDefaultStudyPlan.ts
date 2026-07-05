import type { GrindQuestion } from './grindQuestions'
import { todayISOChicago } from './studyPlanDay'

/** 727-question grind bundle order (same rounds as LeetMastery studyOrder). */
export function grindStudyOrder(questions: GrindQuestion[]): number[] {
  return questions.map(q => q.id)
}

export type DefaultPlanOpts = {
  perDay?: number
  repsPerQ?: number
  reviewStartDays?: number
  revisionCap?: number
  mode?: 'strict' | 'random'
  startDate?: string
}

export async function createDefaultStudyPlan(
  questions: GrindQuestion[],
  opts: DefaultPlanOpts = {},
): Promise<{ ok: boolean; error?: string }> {
  const { saveStudyPlan, saveUserProfile } = await import('./db')
  const perDay = opts.perDay ?? 2
  const repsPerQ = opts.repsPerQ ?? 2
  const reviewStartDays = opts.reviewStartDays ?? 14
  const revisionCap = opts.revisionCap ?? 3
  const mode = opts.mode ?? 'strict'
  const startDate = opts.startDate ?? todayISOChicago()

  const order = grindStudyOrder(questions)
  if (order.length === 0) {
    return { ok: false, error: 'Question list not loaded.' }
  }

  const ok = await saveStudyPlan({
    start_date: startDate,
    per_day: perDay,
    question_order: order,
    lock_code: '',
    mode,
    review_start_days: reviewStartDays,
  })

  if (!ok) {
    return { ok: false, error: 'Could not save plan. Check Supabase connection.' }
  }

  await saveUserProfile({ revisionCap, repsPerQ, reviewStartDays })

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('lm_reps_per_q', String(repsPerQ))
      localStorage.setItem('lm_plan_mode_v1', mode)
    } catch { /* ignore */ }
  }

  return { ok: true }
}

export function planSummary(perDay: number, totalQuestions: number) {
  const days = Math.ceil(totalQuestions / perDay)
  return { days, totalQuestions }
}

/** Create plan if missing; returns normalized plan row or null. */
export async function ensureStudyPlan(
  questions: GrindQuestion[],
): Promise<{ created: boolean; error?: string }> {
  const { getStudyPlan } = await import('./db')
  const { normalizeStudyPlanRow } = await import('./streakGoals')
  const existing = normalizeStudyPlanRow(await getStudyPlan())
  if (existing) return { created: false }
  const result = await createDefaultStudyPlan(questions)
  if (!result.ok) return { created: false, error: result.error }
  return { created: true }
}
