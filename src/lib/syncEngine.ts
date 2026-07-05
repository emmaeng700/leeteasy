/**
 * Apply new LeetCode AC submissions to Daily reps and Review completion.
 * Compares current AC counts to a stored baseline so each new submit counts once.
 */

import { bumpDailyRep, completeReview, getProgress } from '@/lib/db'
import { isQuestionDoneForDailyToday } from '@/lib/dailyCompletion'
import { repsPerQuestion, type DailyQueueItem } from '@/lib/dailyQueue'
import { fetchAcBySlug, loadLcSessionForSync, readLcListSync, syncLeetCodeAccepted } from '@/lib/leetcodeListSync'
import { todayISOChicago } from '@/lib/studyPlanDay'
import { resolveLeetCodeSlug } from '@/lib/utils'
import type { GrindQuestion } from '@/lib/grindQuestions'

const BASELINE_KEY = 'leteasy_ac_baseline'

function readBaseline(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(BASELINE_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function writeBaseline(bySlug: Record<string, number>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(BASELINE_KEY, JSON.stringify(bySlug))
}

function slugForQuestion(q: GrindQuestion): string {
  return resolveLeetCodeSlug(q.id, q.slug)
}

export type SyncApplyResult = {
  ok: boolean
  error?: string
  dailyUpdates: number[]
  reviewUpdates: number[]
  syncedAt?: string
}

export async function syncAndApplyProgress(opts: {
  questions: GrindQuestion[]
  dailyQueue: DailyQueueItem[]
  reviewIds: number[]
}): Promise<SyncApplyResult> {
  const { session, csrf } = await loadLcSessionForSync()
  const { bySlug, error } = await fetchAcBySlug(session, csrf)
  if (error) return { ok: false, error, dailyUpdates: [], reviewUpdates: [] }

  const baseline = readBaseline()
  const dailyUpdates: number[] = []
  const reviewUpdates: number[] = []
  const repsTarget = repsPerQuestion()

  const dailyIds = new Set(
    opts.dailyQueue.filter(i => !i.done).map(i => i.question.id),
  )
  const reviewSet = new Set(opts.reviewIds)

  const progress = (await getProgress()) ?? {}
  const today = todayISOChicago()

  for (const q of opts.questions) {
    const slug = slugForQuestion(q)
    const prev = baseline[slug] ?? 0
    const curr = bySlug[slug] ?? 0
    const delta = curr - prev
    if (delta <= 0) continue

    if (reviewSet.has(q.id)) {
      await completeReview(q.id)
      reviewUpdates.push(q.id)
      reviewSet.delete(q.id)
      continue
    }

    if (dailyIds.has(q.id) && !isQuestionDoneForDailyToday(q.id, progress, today, undefined, repsTarget)) {
      for (let i = 0; i < delta; i++) {
        const row = progress[String(q.id)]
        const todayReps = row?.daily_rep_count ?? 0
        if (todayReps >= repsTarget || isQuestionDoneForDailyToday(q.id, progress, today, undefined, repsTarget)) break
        await bumpDailyRep(q.id)
        if (!dailyUpdates.includes(q.id)) dailyUpdates.push(q.id)
        const fresh = await getProgress()
        if (fresh) Object.assign(progress, fresh)
      }
    }
  }

  writeBaseline(bySlug)
  await syncLeetCodeAccepted(opts.questions, session, csrf)

  const sync = readLcListSync()
  return {
    ok: true,
    dailyUpdates,
    reviewUpdates,
    syncedAt: sync?.syncedAt,
  }
}

/** Seed baseline on first run so old ACs don't auto-complete today's queue. */
export function seedAcBaselineIfNeeded(bySlug: Record<string, number>) {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(BASELINE_KEY)) return
  writeBaseline(bySlug)
}
