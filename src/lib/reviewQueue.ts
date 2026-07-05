import { srInterval } from './utils'
import { todayISOChicago } from './studyPlanDay'
import type { GrindQuestion } from './grindQuestions'

export type ReviewRow = {
  id: number
  review_count: number
  next_review: string
  carried?: boolean
}

export type ReviewQueueItem = {
  row: ReviewRow
  question: GrindQuestion
  daysOverdue: number
  overdueLabel: string
  nextIntervalDays: number
}

export function reviewOverdueLabel(nextReview: string, today = todayISOChicago()): string {
  const [y, m, d] = nextReview.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const now = new Date(today + 'T12:00:00')
  const diff = Math.round((now.getTime() - due.getTime()) / 86400000)
  if (diff <= 0) return 'due today'
  if (diff === 1) return '1 day overdue'
  return `${diff} days overdue`
}

export function daysOverdue(nextReview: string, today = todayISOChicago()): number {
  const [y, m, d] = nextReview.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const now = new Date(today + 'T12:00:00')
  return Math.max(0, Math.round((now.getTime() - due.getTime()) / 86400000))
}

export function buildReviewQueue(
  dueRows: ReviewRow[],
  questions: GrindQuestion[],
): { makeup: ReviewQueueItem[]; today: ReviewQueueItem[] } {
  const today = todayISOChicago()
  const qById = new Map(questions.map(q => [q.id, q]))
  const makeup: ReviewQueueItem[] = []
  const todayList: ReviewQueueItem[] = []

  for (const row of dueRows) {
    const question = qById.get(row.id)
    if (!question) continue
    const item: ReviewQueueItem = {
      row,
      question,
      daysOverdue: daysOverdue(row.next_review, today),
      overdueLabel: reviewOverdueLabel(row.next_review, today),
      nextIntervalDays: srInterval(row.review_count + 1),
    }
    if (row.carried) makeup.push(item)
    else todayList.push(item)
  }

  return { makeup, today: todayList }
}
