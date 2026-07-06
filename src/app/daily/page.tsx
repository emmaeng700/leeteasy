'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, CheckCircle2, Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import QuestionCard from '@/components/QuestionCard'
import DailyPlanSetup, { startIndexToDay } from '@/components/DailyPlanSetup'
import { PageShell } from '@/components/Navbar'
import { withTimeout } from '@/lib/withTimeout'
import { formatSupabaseLoadError } from '@/lib/formatLoadError'
import type { DailyPlanMeta, DailyQueueItem } from '@/lib/dailyQueue'
import type { GrindQuestion } from '@/lib/grindQuestions'

export default function DailyPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [queue, setQueue] = useState<DailyQueueItem[]>([])
  const [meta, setMeta] = useState<DailyPlanMeta | null>(null)
  const [questions, setQuestions] = useState<GrindQuestion[]>([])
  const [reviewIds, setReviewIds] = useState<number[]>([])
  const [markingId, setMarkingId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [noPlan, setNoPlan] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [extraCount, setExtraCount] = useState(0)
  const [planStartDay, setPlanStartDay] = useState<number | undefined>()
  const [planTodayDay, setPlanTodayDay] = useState<number | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setNoPlan(false)
    try {
      const [
        { loadGrindQuestionsBundle },
        { getProgress, getStudyPlan, getDueReviews, getTodayDailyDoneCount },
        { buildDailyQueue, repsPerQuestion },
        { extendPlanWithFlex },
      ] = await Promise.all([
        import('@/lib/grindQuestions'),
        import('@/lib/db'),
        import('@/lib/dailyQueue'),
        import('@/lib/planFlex'),
      ])
      const [qs, planRaw, progress, due, dailyDoneCount] = await Promise.all([
        loadGrindQuestionsBundle(),
        withTimeout(getStudyPlan(), 10000, null),
        withTimeout(getProgress(), 10000, {}),
        withTimeout(getDueReviews(), 10000, []),
        withTimeout(getTodayDailyDoneCount(), 10000, 0),
      ])

      setQuestions(qs)

      const plan = extendPlanWithFlex(planRaw)
      if (plan) {
        setPlanStartDay(startIndexToDay(plan.planStartIndex, plan.per_day))
        setPlanTodayDay(plan.claimedDayIndex + 1)
      }

      setReviewIds(due.map(d => d.id))
      if (plan && progress) {
        const reps = repsPerQuestion()
        const { items, meta: m } = buildDailyQueue(plan, qs, progress, reps, {
          dailyDoneTodayCount: dailyDoneCount,
          dueReviewCount: due.length,
          extraCount,
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
  }, [extraCount])

  useEffect(() => { void load() }, [load])

  const makeup = useMemo(() => queue.filter(q => q.kind === 'makeup'), [queue])
  const todayItems = useMemo(() => queue.filter(q => q.kind === 'today'), [queue])
  const extraItems = useMemo(() => queue.filter(q => q.kind === 'extra'), [queue])
  const doneCount = useMemo(() => queue.filter(q => q.done).length, [queue])
  const nextFocusId = useMemo(() => queue.find(q => !q.done)?.question.id, [queue])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const markDone = async (item: DailyQueueItem) => {
    setMarkingId(item.question.id)
    try {
      const { markDailyQuestionDone } = await import('@/lib/db')
      const result = await markDailyQuestionDone(
        item.question.id,
        item.repsTarget,
        item.question.set,
      )
      if (!result.ok) {
        toast.error(result.error ?? 'Could not mark done')
        return
      }
      if (result.advancedDay) {
        toast.success(`Day block done - moved to plan day ${result.advancedDay}`)
        setExtraCount(0)
      } else if (result.reviewScheduled) {
        toast.success('Marked done - review scheduled')
      } else {
        toast.success('Marked done for today')
      }
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
    tone: 'amber' | 'indigo' | 'zinc',
  ) => {
    if (items.length === 0) return null
    const pending = items.filter(i => !i.done).length
    const border =
      tone === 'amber'
        ? 'border-amber-200 bg-amber-50/50'
        : tone === 'indigo'
          ? 'border-indigo-200 bg-indigo-50/30'
          : 'border-zinc-200 bg-zinc-50/50'
    const titleCls =
      tone === 'amber' ? 'text-amber-900' : tone === 'indigo' ? 'text-indigo-900' : 'text-zinc-800'
    return (
      <section className={`rounded-2xl border p-4 mb-4 ${border}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className={`text-sm font-bold ${titleCls}`}>{title}</h2>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            tone === 'amber' ? 'bg-amber-100 text-amber-800' : tone === 'indigo' ? 'bg-indigo-100 text-indigo-800' : 'bg-zinc-200 text-zinc-700'
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
              badge={
                item.kind === 'makeup'
                  ? 'Catch-up'
                  : item.kind === 'extra'
                    ? 'Extra'
                    : undefined
              }
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
        <div className="flex items-center gap-1.5">
          {meta && (
            <button
              type="button"
              onClick={() => setShowSetup(v => !v)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200"
              title="Adjust start day and today's plan day"
            >
              <Settings2 size={12} />
              Plan
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-100 text-zinc-700 disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
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

      {!loading && (noPlan || showSetup) && !loadError && questions.length > 0 && (
        <DailyPlanSetup
          questions={questions}
          perDay={2}
          existingStartDay={planStartDay}
          existingTodayDay={planTodayDay}
          onSaved={() => {
            setShowSetup(false)
            setNoPlan(false)
            void load()
          }}
          onCancel={noPlan ? undefined : () => setShowSetup(false)}
        />
      )}

      {!loading && !loadError && meta && !showSetup && (
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
                  Started day {meta.startDayNumber} · {meta.perDay} suggested/day · flex mode
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
            {meta.planComplete && makeup.length > 0 && (
              <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                Grind list complete - finish {makeup.length} catch-up question{makeup.length !== 1 ? 's' : ''} when you can.
              </p>
            )}
            {meta.planComplete && makeup.length === 0 && !meta.dayComplete && (
              <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                All 727 questions done. Focus on reviews.
              </p>
            )}
            {!meta.dayComplete && meta.dailyBlockDone && reviewIds.length > 0 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                Daily progress logged - clear {reviewIds.length} review{reviewIds.length !== 1 ? 's' : ''} when due.
              </p>
            )}
          </div>

          <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
            Catch-up first, then today&apos;s suggestions. Do as many as you want - tap <strong>Mark done</strong> after AC on LeetCode. Reviews schedule automatically for Set 1-3.
          </p>

          {queue.length === 0 ? (
            meta.planComplete ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                <p className="font-bold text-emerald-800">All 727 grind questions complete</p>
                <p className="mt-1 text-xs text-emerald-600">Clear catch-up or reviews if any remain.</p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No questions scheduled.</p>
            )
          ) : meta.dayComplete ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
              <p className="font-bold text-emerald-800">All done for today</p>
              <p className="mt-1 text-xs text-emerald-600">Nice work.</p>
            </div>
          ) : (
            <>
              {renderSection(
                'Catch-up',
                'Skipped or missed before today - clear whenever you can.',
                makeup,
                'amber',
              )}
              {renderSection(
                `Suggested (Day ${meta.dayNumber})`,
                `${meta.perDay} questions for this plan day - optional if you want to do more elsewhere.`,
                todayItems,
                'indigo',
              )}
              {renderSection(
                'Extra',
                'Ahead of schedule - you pulled these forward.',
                extraItems,
                'zinc',
              )}
              {meta.hasMore && !meta.planComplete && (
                <button
                  type="button"
                  onClick={() => setExtraCount(c => c + meta.perDay)}
                  className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-indigo-300 text-indigo-700 text-sm font-bold hover:bg-indigo-50"
                >
                  <Plus size={16} />
                  Add {meta.perDay} more from plan
                </button>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  )
}
