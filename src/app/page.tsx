'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppNavLink from '@/components/AppNavLink'
import { Calendar, Brain, RefreshCw, Zap, Code2 } from 'lucide-react'
import { PageShell } from '@/components/Navbar'

import { withTimeout } from '@/lib/withTimeout'
import { formatSupabaseLoadError } from '@/lib/formatLoadError'

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [dailyDone, setDailyDone] = useState(0)
  const [dailyTotal, setDailyTotal] = useState(0)
  const [reviewDue, setReviewDue] = useState(0)
  const [lcSolved, setLcSolved] = useState(0)
  const [dayComplete, setDayComplete] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [
        { loadGrindQuestionsBundle },
        { getProgress, getDueReviews, getStudyPlan, getTodayDailyDoneCount },
        { buildDailyQueue, repsPerQuestion },
        { isDayComplete },
        { readLcListSync, hydrateLcListSync },
        { todayISOChicago },
        { dailyRepsFromProgress },
        { extendPlanWithFlex },
      ] = await Promise.all([
        import('@/lib/grindQuestions'),
        import('@/lib/db'),
        import('@/lib/dailyQueue'),
        import('@/lib/streakGoals'),
        import('@/lib/leetcodeListSync'),
        import('@/lib/studyPlanDay'),
        import('@/lib/dailyCompletion'),
        import('@/lib/planFlex'),
      ])

      const [questions, planRaw, progress, due, dailyDoneCount] = await Promise.all([
        loadGrindQuestionsBundle(),
        withTimeout(getStudyPlan(), 8000, null),
        withTimeout(getProgress(), 8000, {}),
        withTimeout(getDueReviews(), 8000, []),
        withTimeout(getTodayDailyDoneCount(), 8000, 0),
      ])

      const progressMap = progress ?? {}
      const plan = extendPlanWithFlex(planRaw)
      const repsPerQ = repsPerQuestion()
      const dailyReps = dailyRepsFromProgress(progressMap, todayISOChicago())

      if (plan) {
        const { items } = buildDailyQueue(plan, questions, progressMap, repsPerQ, {
          dailyDoneTodayCount: dailyDoneCount,
          dueReviewCount: due.length,
        })
        setDailyTotal(items.length)
        setDailyDone(items.filter(q => q.done).length)
        setDayComplete(isDayComplete(plan, progressMap, due.length, {
          mode: plan.mode,
          dailyDoneTodayCount: dailyDoneCount,
          dailyReps,
          repsPerQ,
        }))
      }

      setReviewDue(due.length)
      const sync = await hydrateLcListSync()
      setLcSolved(sync?.grindAcCount ?? sync?.solvedIds.length ?? 0)
    } catch (e) {
      setLoadError(formatSupabaseLoadError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const cards = useMemo(() => [
    {
      href: '/grind-offline.html',
      icon: Code2,
      label: 'Grind',
      stat: loading ? '...' : '727',
      hint: 'Works offline',
      color: 'from-slate-600 to-zinc-800',
    },
    {
      href: '/daily',
      icon: Calendar,
      label: 'Daily',
      stat: loading ? '...' : `${dailyDone}/${dailyTotal}`,
      hint: 'Today + makeup',
      color: 'from-violet-500 to-indigo-600',
    },
    {
      href: '/review',
      icon: Brain,
      label: 'Reviews',
      stat: loading ? '...' : String(reviewDue),
      hint: reviewDue ? 'due today' : 'all clear',
      color: 'from-rose-500 to-orange-500',
    },
    {
      href: '/leetcode',
      icon: Zap,
      label: 'LeetCode',
      stat: loading ? '...' : String(lcSolved),
      hint: 'AC on LC',
      color: 'from-emerald-500 to-teal-600',
    },
  ], [loading, dailyDone, dailyTotal, reviewDue, lcSolved])

  return (
    <PageShell title="LeetEasy">
      {!loading && loadError && (
        <div className="mb-5 rounded-2xl px-4 py-3 text-sm border border-amber-200 bg-amber-50 text-amber-800">
          Could not load stats: {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm font-medium ${
          dayComplete
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            : 'bg-white border border-zinc-200 text-zinc-600'
        }`}>
          {dayComplete
            ? 'Today is complete - nice work.'
            : 'Tap a card, solve on LeetCode, come back to sync.'}
        </div>
      )}

      <div className="grid gap-3">
        {cards.map(({ href, icon: Icon, label, stat, hint, color }) => (
          <AppNavLink
            key={href}
            href={href}
            className="flex items-center gap-4 rounded-2xl bg-white border border-zinc-200 p-4 shadow-sm active:scale-[0.99] transition-transform"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-md`}>
              <Icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-zinc-900">{label}</p>
              <p className="text-xs text-zinc-500">{hint}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums text-zinc-900">{stat}</p>
            </div>
          </AppNavLink>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void load()}
        className="mt-6 w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-indigo-600 rounded-xl border border-indigo-200 bg-indigo-50"
      >
        <RefreshCw size={14} /> Refresh
      </button>
    </PageShell>
  )
}
