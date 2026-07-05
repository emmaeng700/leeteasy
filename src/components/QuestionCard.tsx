'use client'

import { Check, ExternalLink } from 'lucide-react'
import DifficultyBadge from './DifficultyBadge'
import { leetCodeUrl } from '@/lib/utils'
import type { Question } from '@/lib/questions'

type Props = {
  question: Question
  done?: boolean
  badge?: string
  sub?: string
  onOpen?: () => void
}

export default function QuestionCard({ question, done, badge, sub, onOpen }: Props) {
  const href = leetCodeUrl(question.slug)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={`flex items-start gap-3 rounded-2xl border p-4 transition-all active:scale-[0.99] ${
        done
          ? 'border-emerald-200 bg-emerald-50/60'
          : 'border-zinc-200 bg-white hover:border-indigo-300 hover:shadow-sm'
      }`}
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
        done ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-600'
      }`}>
        {done ? <Check size={16} /> : <ExternalLink size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-400">#{question.id}</span>
          <DifficultyBadge difficulty={question.difficulty} />
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <p className={`mt-1 font-semibold leading-snug ${done ? 'text-emerald-800' : 'text-zinc-900'}`}>
          {question.title}
        </p>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
    </a>
  )
}
