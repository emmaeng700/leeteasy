'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import QuestionCard from '@/components/QuestionCard'
import { PageShell } from '@/components/Navbar'
import { withTimeout } from '@/lib/withTimeout'
import type { DailyQueueItem } from '@/lib/dailyQueue'
import type { Question } from '@/lib/questions'
import { useLcSync } from '@/hooks/useLcSync'

export default function DailyPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [queue, setQueue] = useState<DailyQueueItem[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [reviewIds, setReviewIds] = useState<number[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [
        { loadQuestions },
        { getProgress, getStudyPlan, getDueReviews },
        { buildDailyQueue, repsPerQuestion },
        { normalizeStudyPlanRow },
      ] = await Promise.all([
        import('@/lib/questions'),
        import('@/lib/db'),
        import('@/lib/dailyQueue'),
        import('@/lib/streakGoals'),
      ])

      const [qs, planRaw, progress, due] = await Promise.all([
        loadQuestions(),
        withTimeout(getStudyPlan(), 10000, null),
        withTimeout(getProgress(), 10000, {}),
        withTimeout(getDueReviews(), 10000, []),
      ])

      setQuestions(qs)
      setReviewIds(due.map(d => d.id))
      const plan = normalizeStudyPlanRow(planRaw)
      if (plan && progress) {
        setQueue(buildDailyQueue(plan, qs, progress, repsPerQuestion()))
      } else {
        setQueue([])
        if (!plan) setLoadError('No study plan in Supabase. Set one up in LeetMastery first.')
      }
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const doneCount = useMemo(() => queue.filter(q => q.done).length, [queue])
  const makeupCount = useMemo(() => queue.filter(q => q.kind === 'makeup').length, [queue])

  const { syncing, lastError, runSync } = useLcSync({
    questions,
    dailyQueue: queue,
    reviewIds,
    enabled: !loading && questions.length > 0,
    onApplied: () => {
      toast.success('Synced from LeetCode')
      void load()
    },
  })

  useEffect(() => {
    if (lastError) toast.error(lastError)
  }, [lastError])

  return (
    <PageShell
      title="Daily"
      action={
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white disabled:opacity-50"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          Sync
        </button>
      }
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm">
          <Loader2 className="animate-spin" size={20} />
          Loading daily queue...
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      {!loading && !loadError && queue.length === 0 && (
        <p className="text-sm text-zinc-500">No questions scheduled for today.</p>
      )}

      {!loading && !loadError && queue.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-zinc-600">
              <span className="font-bold text-zinc-900">{doneCount}/{queue.length}</span> done
            </span>
            {makeupCount > 0 && (
              <span className="text-orange-600 font-semibold text-xs">{makeupCount} makeup</span>
            )}
          </div>
          <p className="mb-4 text-xs text-zinc-500 leading-relaxed">
            Tap a problem to open in LeetCode. When you AC, return here to sync.
          </p>
          <div className="space-y-3">
            {queue.map(item => (
              <QuestionCard
                key={`${item.kind}-${item.question.id}`}
                question={item.question}
                done={item.done}
                badge={item.kind === 'makeup' ? 'Makeup' : undefined}
                sub={item.done ? 'Done for today' : `${item.reps}/${item.repsTarget} reps`}
              />
            ))}
          </div>
        </>
      )}
    </PageShell>
  )
}
