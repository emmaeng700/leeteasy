'use client'

import { Check, ExternalLink, CheckCircle2 } from 'lucide-react'
import DifficultyBadge from './DifficultyBadge'
import PriorityBadge from './PriorityBadge'
import { leetCodeUrl } from '@/lib/utils'
import type { GrindQuestion } from '@/lib/grindQuestions'

type Props = {
  question: GrindQuestion
  done?: boolean
  badge?: string
  sub?: string
  highlight?: boolean
  onMarkDone?: () => void
  markingDone?: boolean
}

export default function QuestionCard({
  question,
  done,
  badge,
  sub,
  highlight,
  onMarkDone,
  markingDone,
}: Props) {
  const href = leetCodeUrl(question.slug)

  return (
    <div
      className={`rounded-2xl border transition-all ${
        done
          ? 'border-emerald-200 bg-emerald-50/60'
          : highlight
            ? 'border-indigo-300 bg-indigo-50/40 shadow-sm'
            : 'border-zinc-200 bg-white'
      }`}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 p-4 active:scale-[0.99]"
      >
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          done ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-600'
        }`}>
          {done ? <Check size={16} /> : <ExternalLink size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono text-zinc-400">#{question.id}</span>
            <DifficultyBadge difficulty={question.difficulty} />
            {question.pattern && <PriorityBadge pattern={question.pattern} />}
            {badge && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </div>
          <p className={`mt-1 font-semibold leading-snug ${done ? 'text-emerald-800' : 'text-zinc-900'}`}>
            {question.title}
          </p>
          {question.pattern && (
            <p className="mt-0.5 text-[10px] text-zinc-400 truncate">{question.pattern}</p>
          )}
          {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
        </div>
      </a>
      {!done && onMarkDone && (
        <div className="px-4 pb-3 pt-0 flex justify-end border-t border-zinc-100/80">
          <button
            type="button"
            disabled={markingDone}
            onClick={e => { e.preventDefault(); onMarkDone() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
          >
            <CheckCircle2 size={12} />
            {markingDone ? 'Saving...' : 'Mark done'}
          </button>
        </div>
      )}
    </div>
  )
}
