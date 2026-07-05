'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import QuestionCard from '@/components/QuestionCard'
import { PageShell } from '@/components/Navbar'
import { withTimeout } from '@/lib/withTimeout'
import type { DailyQueueItem } from '@/lib/dailyQueue'
import type { GrindQuestion } from '@/lib/grindQuestions'
import type { ReviewQueueItem } from '@/lib/reviewQueue'
import { useLcSync } from '@/hooks/useLcSync'

export default function ReviewPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [makeup, setMakeup] = useState<ReviewQueueItem[]>([])
  const [dueToday, setDueToday] = useState<ReviewQueueItem[]>([])
  const [questions, setQuestions] = useState<GrindQuestion[]>([])
  const [dailyQueue, setDailyQueue] = useState<DailyQueueItem[]>([])
  const [reviewCap, setReviewCap] = useState(3)
  const [scheduledCount, setScheduledCount] = useState(0)
  const [today, setToday] = useState('')
  const [markingId, setMarkingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [
        { loadGrindQuestionsBundle },
        { getDueReviews, getProgress, getStudyPlan, getUserRevisionCap, getSrScheduleWindow },
        { buildDailyQueue, repsPerQuestion },
        { normalizeStudyPlanRow },
        { todayISOChicago },
        { buildReviewQueue: buildRQ },
      ] = await Promise.all([
        import('@/lib/grindQuestions'),
        import('@/lib/db'),
        import('@/lib/dailyQueue'),
        import('@/lib/streakGoals'),
        import('@/lib/studyPlanDay'),
        import('@/lib/reviewQueue'),
      ])
      setToday(todayISOChicago())

      const [qs, planRaw, progress, dueRows, cap, scheduled] = await Promise.all([
        loadGrindQuestionsBundle(),
        withTimeout(getStudyPlan(), 10000, null),
        withTimeout(getProgress(), 10000, {}),
        withTimeout(getDueReviews(), 10000, []),
        withTimeout(getUserRevisionCap(), 5000, 3),
        withTimeout(getSrScheduleWindow(30), 10000, []),
      ])

      setQuestions(qs)
      setReviewCap(cap)
      setScheduledCount(scheduled.length)

      const { makeup: m, today: t } = buildRQ(dueRows, qs)
      setMakeup(m)
      setDueToday(t)

      const plan = normalizeStudyPlanRow(planRaw)
      if (plan && progress) {
        const { items } = buildDailyQueue(plan, qs, progress, repsPerQuestion())
        setDailyQueue(items)
      }
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const allDue = useMemo(() => [...makeup, ...dueToday], [makeup, dueToday])
  const reviewIds = useMemo(() => allDue.map(d => d.row.id), [allDue])
  const totalDue = allDue.length

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

  const markReviewDone = async (id: number) => {
    setMarkingId(id)
    try {
      const { completeReview } = await import('@/lib/db')
      const result = await completeReview(id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Review done - next in ${result.next_review}`)
      void load()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setMarkingId(null)
    }
  }

  const renderReviewSection = (
    title: string,
    desc: string,
    items: ReviewQueueItem[],
    tone: 'amber' | 'indigo',
  ) => {
    if (items.length === 0) return null
    const border = tone === 'amber' ? 'border-amber-200 bg-amber-50/50' : 'border-indigo-200 bg-indigo-50/30'
    const titleCls = tone === 'amber' ? 'text-amber-900' : 'text-indigo-900'
    return (
      <section className={`rounded-2xl border p-4 mb-4 ${border}`}>
        <h2 className={`text-sm font-bold ${titleCls} mb-1`}>{title}</h2>
        <p className="text-xs text-zinc-600 mb-3">{desc}</p>
        <div className="space-y-3">
          {items.map(({ row, question, overdueLabel, nextIntervalDays }) => (
            <QuestionCard
              key={row.id}
              question={question}
              badge={row.carried ? 'Catch-up' : undefined}
              sub={`Review #${row.review_count + 1} - ${overdueLabel} - next interval ${nextIntervalDays}d`}
              onMarkDone={() => void markReviewDone(row.id)}
              markingDone={markingId === row.id}
            />
          ))}
        </div>
      </section>
    )
  }

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

      {!loading && !loadError && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
              <p className="text-xl font-black text-orange-500">{totalDue}</p>
              <p className="text-[10px] text-zinc-500">Due today</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
              <p className="text-xl font-black text-indigo-500">{reviewCap}</p>
              <p className="text-[10px] text-zinc-500">Daily cap</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
              <p className="text-xl font-black text-zinc-700">{scheduledCount}</p>
              <p className="text-[10px] text-zinc-500">Scheduled</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
            <Brain size={14} className="text-indigo-500" />
            <span>Tap to open in LeetCode. Sync AC or use Mark done.</span>
          </div>

          {totalDue === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-emerald-800">No reviews due</p>
              <p className="mt-1 text-xs text-emerald-600">Caught up for {today}</p>
            </div>
          ) : (
            <>
              {renderReviewSection(
                'Review catch-up',
                'Rolled forward from missed days - clear these first.',
                makeup,
                'amber',
              )}
              {renderReviewSection(
                'Due today',
                `Up to ${reviewCap} natural reviews per day (catch-up is unlimited).`,
                dueToday,
                'indigo',
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  )
}
