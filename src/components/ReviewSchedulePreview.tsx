'use client'

import type { GrindQuestion } from '@/lib/grindQuestions'
import { srInterval } from '@/lib/utils'

type Upcoming = {
  id: number
  review_count: number
  next_review: string
  last_reviewed: string | null
}

type Props = {
  stats: {
    inSystem: number
    dueToday: number
    upcoming30: number
    reviewStartDays: number
  }
  upcoming: Upcoming[]
  questions: GrindQuestion[]
  reviewCap: number
  today: string
}

function formatDate(iso: string) {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function ReviewSchedulePreview({ stats, upcoming, questions, reviewCap, today }: Props) {
  const qById = new Map(questions.map(q => [q.id, q]))
  const firstDue = upcoming[0]

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 mb-4">
      <h2 className="text-sm font-bold text-violet-900 mb-2">How reviews work</h2>
      <div className="text-xs text-violet-900/85 leading-relaxed space-y-2 mb-4">
        <p>
          <strong>Start:</strong> When you <strong>Mark done</strong> on a Set 1-3 question on Daily,
          the first review is scheduled <strong>{stats.reviewStartDays} days</strong> later.
        </p>
        <p>
          <strong>After that:</strong> each completed review schedules the next in{' '}
          <strong>{srInterval(0)}d</strong>, then <strong>{srInterval(1)}d</strong>, then <strong>{srInterval(2)}d</strong> (repeats 7d).
        </p>
        <p>
          <strong>Daily cap:</strong> up to <strong>{reviewCap}</strong> new reviews per day.
          Missed reviews roll forward (unlimited catch-up).
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-white border border-violet-100 p-2 text-center">
          <p className="text-lg font-black text-violet-700 tabular-nums">{stats.inSystem}</p>
          <p className="text-[9px] text-zinc-500">In review system</p>
        </div>
        <div className="rounded-lg bg-white border border-violet-100 p-2 text-center">
          <p className="text-lg font-black text-orange-500 tabular-nums">{stats.dueToday}</p>
          <p className="text-[9px] text-zinc-500">Due today</p>
        </div>
        <div className="rounded-lg bg-white border border-violet-100 p-2 text-center">
          <p className="text-lg font-black text-zinc-700 tabular-nums">{stats.upcoming30}</p>
          <p className="text-[9px] text-zinc-500">Next 30 days</p>
        </div>
      </div>

      {stats.inSystem === 0 ? (
        <p className="text-xs text-violet-800/80 bg-white/60 rounded-lg px-3 py-2">
          No reviews scheduled yet. Mark done on Daily (Set 1-3) to start.
          Example: mark done today - first review around{' '}
          <strong>{formatDate(addDays(today, stats.reviewStartDays))}</strong>.
        </p>
      ) : firstDue ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mb-2">
            Upcoming (next {Math.min(upcoming.length, 8)})
          </p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {upcoming.slice(0, 8).map(row => {
              const q = qById.get(row.id)
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-xs bg-white/70 rounded-lg px-2.5 py-1.5 border border-violet-100"
                >
                  <span className="truncate font-medium text-zinc-800">
                    #{row.id} {q?.title ?? 'Question'}
                    {q?.set ? <span className="text-zinc-400 ml-1">S{q.set}</span> : null}
                  </span>
                  <span className="shrink-0 text-violet-700 font-semibold tabular-nums">
                    {formatDate(row.next_review)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-violet-800/80">All scheduled reviews are due today or overdue.</p>
      )}
    </section>
  )
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}
