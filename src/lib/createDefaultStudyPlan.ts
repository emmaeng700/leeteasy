import type { GrindQuestion } from './grindQuestions'
import { todayISOChicago } from './studyPlanDay'

/** Grind bundle order matches LeetMastery studyOrder (priority rounds, Easy to Hard). */
export function grindStudyOrder(questions: GrindQuestion[]): number[] {
  return questions.map(q => q.id)
}

export type DefaultPlanOpts = {
  perDay?: number
  repsPerQ?: number
  reviewStartDays?: number
  mode?: 'strict' | 'random'
  startDate?: string
}

/** Same plan shape as LeetMastery Daily setup, without in-app editor. */
export async function createDefaultStudyPlan(
  questions: GrindQuestion[],
  opts: DefaultPlanOpts = {},
): Promise<{ ok: boolean; error?: string }> {
  const { saveStudyPlan } = await import('./db')
  const perDay = opts.perDay ?? 2
  const repsPerQ = opts.repsPerQ ?? 2
  const reviewStartDays = opts.reviewStartDays ?? 14
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
