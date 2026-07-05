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

type ReviewItem = {
  id: number
  review_count: number
  next_review: string
  carried?: boolean
}

export default function ReviewPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [due, setDue] = useState<ReviewItem[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [dailyQueue, setDailyQueue] = useState<DailyQueueItem[]>([])
  const [today, setToday] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [
        { loadQuestions },
        { getDueReviews, getProgress, getStudyPlan },
        { buildDailyQueue, repsPerQuestion },
        { normalizeStudyPlanRow },
        { todayISOChicago },
      ] = await Promise.all([
        import('@/lib/questions'),
        import('@/lib/db'),
        import('@/lib/dailyQueue'),
        import('@/lib/streakGoals'),
        import('@/lib/studyPlanDay'),
      ])
      setToday(todayISOChicago())

      const [qs, planRaw, progress, dueRows] = await Promise.all([
        loadQuestions(),
        withTimeout(getStudyPlan(), 10000, null),
        withTimeout(getProgress(), 10000, {}),
        withTimeout(getDueReviews(), 10000, []),
      ])

      setQuestions(qs)
      setDue(dueRows as ReviewItem[])
      const plan = normalizeStudyPlanRow(planRaw)
      if (plan && progress) {
        setDailyQueue(buildDailyQueue(plan, qs, progress, repsPerQuestion()))
      }
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const reviewIds = useMemo(() => due.map(d => d.id), [due])

  const { syncing, lastError, runSync } = useLcSync({
    questions,
    dailyQueue,
    reviewIds,
    enabled: !loading,
    onApplied: () => {
      toast.success('Review synced from LeetCode')
      void load()
    },
  })

  useEffect(() => {
    if (lastError) toast.error(lastError)
  }, [lastError])

  return (
    <PageShell
      title="Reviews"
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
          Loading reviews...
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      {!loading && !loadError && due.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
          <p className="font-semibold text-emerald-800">No reviews due</p>
          <p className="mt-1 text-xs text-emerald-600">You are caught up for {today}</p>
        </div>
      )}

      {!loading && !loadError && due.length > 0 && (
        <>
          <p className="mb-4 text-xs text-zinc-500">
            {due.length} due - open in LeetCode, solve, return to sync.
          </p>
          <div className="space-y-3">
            {due.map(row => {
              const q = questions.find(x => x.id === row.id)
              if (!q) return null
              const overdue = row.next_review < today
              return (
                <QuestionCard
                  key={row.id}
                  question={q}
                  badge={row.carried ? 'Makeup' : overdue ? 'Overdue' : 'Due'}
                  sub={`Review #${row.review_count + 1} - due ${row.next_review}`}
                />
              )
            })}
          </div>
        </>
      )}
    </PageShell>
  )
}
