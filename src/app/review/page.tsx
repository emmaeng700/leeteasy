'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import QuestionCard from '@/components/QuestionCard'
import ReviewSchedulePreview from '@/components/ReviewSchedulePreview'
import { PageShell } from '@/components/Navbar'
import { withTimeout } from '@/lib/withTimeout'
import type { ReviewQueueItem } from '@/lib/reviewQueue'
import type { GrindQuestion } from '@/lib/grindQuestions'

export default function ReviewPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [makeup, setMakeup] = useState<ReviewQueueItem[]>([])
  const [dueToday, setDueToday] = useState<ReviewQueueItem[]>([])
  const [questions, setQuestions] = useState<GrindQuestion[]>([])
  const [reviewCap, setReviewCap] = useState(3)
  const [scheduledCount, setScheduledCount] = useState(0)
  const [today, setToday] = useState('')
  const [markingId, setMarkingId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [pipeline, setPipeline] = useState({
    inSystem: 0,
    dueToday: 0,
    upcoming30: 0,
    reviewStartDays: 14,
  })
  const [upcoming, setUpcoming] = useState<Array<{
    id: number
    review_count: number
    next_review: string
    last_reviewed: string | null
  }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [
        { loadGrindQuestionsBundle },
        { getDueReviews, getUserRevisionCap, getSrScheduleWindow, getUpcomingReviews, getReviewPipelineStats },
        { todayISOChicago },
        { buildReviewQueue: buildRQ },
      ] = await Promise.all([
        import('@/lib/grindQuestions'),
        import('@/lib/db'),
        import('@/lib/studyPlanDay'),
        import('@/lib/reviewQueue'),
      ])
      setToday(todayISOChicago())

      const [qs, dueRows, cap, scheduled, stats, upcomingRows] = await Promise.all([
        loadGrindQuestionsBundle(),
        withTimeout(getDueReviews(), 10000, []),
        withTimeout(getUserRevisionCap(), 5000, 3),
        withTimeout(getSrScheduleWindow(30), 10000, []),
        withTimeout(getReviewPipelineStats(), 10000, {
          inSystem: 0, dueToday: 0, upcoming30: 0, reviewStartDays: 14,
        }),
        withTimeout(getUpcomingReviews(12), 10000, []),
      ])

      setQuestions(qs)
      setReviewCap(cap)
      setScheduledCount(scheduled.length)
      setPipeline(stats)
      setUpcoming(upcomingRows)

      const { makeup: m, today: t } = buildRQ(dueRows, qs)
      setMakeup(m)
      setDueToday(t)
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const allDue = useMemo(() => [...makeup, ...dueToday], [makeup, dueToday])
  const totalDue = allDue.length

  const refresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

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
          onClick={() => void refresh()}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-100 text-zinc-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
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
          <ReviewSchedulePreview
            stats={pipeline}
            upcoming={upcoming}
            questions={questions}
            reviewCap={reviewCap}
            today={today}
          />

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
              <p className="text-[10px] text-zinc-500">Next 30 days</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
            <Brain size={14} className="text-indigo-500" />
            <span>Tap to open in LeetCode. Use <strong>Mark done</strong> after you AC.</span>
          </div>

          {totalDue === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-emerald-800">No reviews due right now</p>
              <p className="mt-1 text-xs text-emerald-600">See schedule above for when they start.</p>
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
