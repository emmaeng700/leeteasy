/**
 * Calendar math for the study plan — must match `getTodayInfo` on /daily
 * (America/Chicago “today”, same diffDays as Daily).
 */

export interface StudyPlanForStreak {
  start_date: string
  per_day: number
  question_order: number[]
  mode?: string
}

export function todayISOChicago() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

/** Same as Daily page: diff from plan start to “today” in Chicago. */
export function diffDaysSincePlanStart(planStartDate: string): number {
  const today = todayISOChicago()
  const start = new Date(planStartDate)
  start.setHours(0, 0, 0, 0)
  const now = new Date(today)
  now.setHours(0, 0, 0, 0)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime())) return 0
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Number.isFinite(diffDays) ? diffDays : 0
}

/** Supabase may return `question_order` as number[] or a JSON string. */
export function parseQuestionOrder(raw: unknown): number[] {
  let qo = raw
  if (typeof qo === 'string') {
    try {
      qo = JSON.parse(qo)
    } catch {
      return []
    }
  }
  if (!Array.isArray(qo)) return []
  return qo.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0)
}

/** Supabase may return `question_order` as number[] or a JSON string. */
export function normalizeStudyPlanRow(raw: unknown): StudyPlanForStreak | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const qo = parseQuestionOrder(p.question_order)
  if (qo.length === 0) return null
  const perDay = Number(p.per_day)
  const startDate = String(p.start_date ?? '')
  if (!startDate || !Number.isFinite(perDay) || perDay < 1) return null
  return {
    start_date: startDate,
    per_day: perDay,
    question_order: qo,
    mode: typeof p.mode === 'string' ? p.mode : undefined,
  }
}
