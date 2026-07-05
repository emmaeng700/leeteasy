'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import QuestionCard from '@/components/QuestionCard'
import { PageShell } from '@/components/Navbar'
import { withTimeout } from '@/lib/withTimeout'
import { formatSupabaseLoadError } from '@/lib/formatLoadError'
import type { DailyPlanMeta, DailyQueueItem } from '@/lib/dailyQueue'
import type { GrindQuestion } from '@/lib/grindQuestions'
import { useLcSync } from '@/hooks/useLcSync'

export default function DailyPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [queue, setQueue] = useState<DailyQueueItem[]>([])
  const [meta, setMeta] = useState<DailyPlanMeta | null>(null)
  const [questions, setQuestions] = useState<GrindQuestion[]>([])
  const [reviewIds, setReviewIds] = useState<number[]>([])
  const [markingId, setMarkingId] = useState<number | null>(null)
  const [noPlan, setNoPlan] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setNoPlan(false)
    try {
      const [
        { loadGrindQuestionsBundle },
        { getProgress, getStudyPlan, getDueReviews, getTodayDailyDoneCount },
        { buildDailyQueue, repsPerQuestion },
        { normalizeStudyPlanRow },
      ] = await Promise.all([
        import('@/lib/grindQuestions'),
        import('@/lib/db'),
        import('@/lib/dailyQueue'),
        import('@/lib/streakGoals'),
      ])
      const [qs, planRaw, progress, due, dailyDoneCount] = await Promise.all([
        loadGrindQuestionsBundle(),
        withTimeout(getStudyPlan(), 10000, null),
        withTimeout(getProgress(), 10000, {}),
        withTimeout(getDueReviews(), 10000, []),
        withTimeout(getTodayDailyDoneCount(), 10000, 0),
      ])

      setQuestions(qs)

      let plan = normalizeStudyPlanRow(planRaw)
      if (!plan && qs.length > 0) {
        const { ensureStudyPlan } = await import('@/lib/createDefaultStudyPlan')
        const ensured = await ensureStudyPlan(qs)
        if (ensured.created) {
          toast.success('Daily plan created - Day 1 starts today')
          const fresh = await getStudyPlan()
          plan = normalizeStudyPlanRow(fresh)
        } else if (ensured.error) {
          setLoadError(ensured.error)
          return
        }
      }

      setReviewIds(due.map(d => d.id))
      if (plan && progress) {
        const reps = repsPerQuestion()
        const { items, meta: m } = buildDailyQueue(plan, qs, progress, reps, {
          dailyDoneTodayCount: dailyDoneCount,
          dueReviewCount: due.length,
        })
        setQueue(items)
        setMeta(m)
      } else {
        setQueue([])
        setMeta(null)
        if (!plan) setNoPlan(true)
      }
    } catch (e) {
      setLoadError(formatSupabaseLoadError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const makeup = useMemo(() => queue.filter(q => q.kind === 'makeup'), [queue])
  const todayItems = useMemo(() => queue.filter(q => q.kind === 'today'), [queue])
  const doneCount = useMemo(() => queue.filter(q => q.done).length, [queue])
  const nextFocusId = useMemo(() => queue.find(q => !q.done)?.question.id, [queue])

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

  const createPlan = async () => {
    setCreatingPlan(true)
    try {
      const { createDefaultStudyPlan, planSummary } = await import('@/lib/createDefaultStudyPlan')
      const qs = questions.length ? questions : await import('@/lib/grindQuestions').then(m => m.loadGrindQuestionsBundle())
      const result = await createDefaultStudyPlan(qs, { perDay: 2, repsPerQ: 2 })
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to create plan')
        return
      }
      const { days } = planSummary(2, qs.length)
      toast.success(`Study plan created - ${days} days, 2 questions/day`)
      void load()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setCreatingPlan(false)
    }
  }

  const markDone = async (item: DailyQueueItem) => {
    setMarkingId(item.question.id)
    try {
      const { setDailyRep } = await import('@/lib/db')
      await setDailyRep(item.question.id, item.repsTarget)
      toast.success('Marked done for today')
      void load()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setMarkingId(null)
    }
  }

  const renderSection = (
    title: string,
    desc: string,
    items: DailyQueueItem[],
    tone: 'amber' | 'indigo',
  ) => {
    if (items.length === 0) return null
    const pending = items.filter(i => !i.done).length
    const border = tone === 'amber' ? 'border-amber-200 bg-amber-50/50' : 'border-indigo-200 bg-indigo-50/30'
    const titleCls = tone === 'amber' ? 'text-amber-900' : 'text-indigo-900'
    return (
      <section className={`rounded-2xl border p-4 mb-4 ${border}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className={`text-sm font-bold ${titleCls}`}>{title}</h2>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
          }`}>
            {pending} left
          </span>
        </div>
        <p className="text-xs text-zinc-600 mb-3">{desc}</p>
        <div className="space-y-3">
          {items.map(item => (
            <QuestionCard
              key={`${item.kind}-${item.question.id}`}
              question={item.question}
              done={item.done}
              highlight={item.question.id === nextFocusId}
              badge={item.kind === 'makeup' ? 'Catch-up' : undefined}
              sub={
                item.done
                  ? 'Done for today'
                  : `${item.reps}/${item.repsTarget} reps - tap to open in LeetCode`
              }
              onMarkDone={() => void markDone(item)}
              markingDone={markingId === item.question.id}
            />
          ))}
        </div>
      </section>
    )
  }

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

      {!loading && noPlan && !loadError && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-6">
          <p className="font-bold text-indigo-900">Set up your daily plan</p>
          <p className="mt-2 text-sm text-indigo-800/90 leading-relaxed">
            727 questions in grind order, 2 per day, strict mode with catch-up, 2 reps each.
            Solve on LeetCode - tap a question to open it there.
          </p>
          <ul className="mt-3 text-xs text-indigo-700/80 space-y-1 list-disc pl-4">
            <li>Priority rounds (High, Mid, Low), Easy then Medium then Hard</li>
            <li>Missed days roll forward as catch-up</li>
            <li>Reviews unlock after you finish daily block</li>
          </ul>
          <button
            type="button"
            onClick={() => void createPlan()}
            disabled={creatingPlan}
            className="mt-4 w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {creatingPlan ? 'Creating...' : 'Create study plan (start today)'}
          </button>
        </div>
      )}

      {!loading && !loadError && meta && (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 mb-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Calendar size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">
                  Plan day {meta.dayNumber} of {meta.totalDays}
                </p>
                <p className="text-xs text-zinc-500">
                  {meta.perDay} questions/day - {meta.repsPerQ} reps each on Daily
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black tabular-nums text-zinc-900">{doneCount}/{queue.length}</p>
                <p className="text-[10px] text-zinc-400">done</p>
              </div>
            </div>
            {meta.dayComplete && (
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                <CheckCircle2 size={16} />
                Today complete (daily + reviews)
              </div>
            )}
            {!meta.dayComplete && meta.dailyBlockDone && reviewIds.length > 0 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                Daily block done - clear {reviewIds.length} review{reviewIds.length !== 1 ? 's' : ''} to finish the day.
              </p>
            )}
          </div>

          <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
            Catch-up first, then today&apos;s block. Open in LeetCode, AC, return and tap Sync (or Mark done).
          </p>

          {queue.length === 0 ? (
            <p className="text-sm text-zinc-500">No questions scheduled.</p>
          ) : meta.dayComplete ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
              <p className="font-bold text-emerald-800">All done for today</p>
              <p className="mt-1 text-xs text-emerald-600">Nice work.</p>
            </div>
          ) : (
            <>
              {renderSection(
                'Catch-up',
                'Missed from earlier plan days - do these before today\'s block.',
                makeup,
                'amber',
              )}
              {renderSection(
                `Today (Day ${meta.dayNumber})`,
                `${meta.perDay} questions scheduled for this plan day.`,
                todayItems,
                'indigo',
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  )
}
