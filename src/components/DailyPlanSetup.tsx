'use client'

import { useMemo, useState } from 'react'
import { Calendar, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { GrindQuestion } from '@/lib/grindQuestions'
import {
  clampClaimedDay,
  clampStartIndex,
  dayToStartIndex,
  persistPlanFlex,
  startIndexToDay,
  totalPlanDays,
} from '@/lib/planFlex'

type Props = {
  questions: GrindQuestion[]
  perDay: number
  existingStartDay?: number
  existingTodayDay?: number
  onSaved: () => void
  onCancel?: () => void
}

export default function DailyPlanSetup({
  questions,
  perDay,
  existingStartDay,
  existingTodayDay,
  onSaved,
  onCancel,
}: Props) {
  const totalDays = useMemo(() => totalPlanDays(questions.length, perDay), [questions.length, perDay])
  const [startDay, setStartDay] = useState(existingStartDay ?? 1)
  const [todayDay, setTodayDay] = useState(existingTodayDay ?? existingStartDay ?? 1)
  const [saving, setSaving] = useState(false)

  const startIndex = dayToStartIndex(startDay, perDay)
  const catchUpCount = startIndex
  const todayBlockCount = Math.min(perDay, Math.max(0, questions.length - dayToStartIndex(todayDay, perDay)))

  const save = async () => {
    setSaving(true)
    try {
      const startIdx = clampStartIndex(dayToStartIndex(startDay, perDay), questions.length)
      const claimedIdx = clampClaimedDay(todayDay - 1, questions.length, perDay)
      if (todayDay < startDay) {
        toast.error('Today plan day cannot be before your start day')
        return
      }

      const { createDefaultStudyPlan } = await import('@/lib/createDefaultStudyPlan')
      const hasPlan = existingStartDay != null
      if (!hasPlan) {
        const result = await createDefaultStudyPlan(questions, {
          perDay,
          repsPerQ: 2,
          mode: 'flex',
          planStartIndex: startIdx,
          claimedDayIndex: claimedIdx,
        })
        if (!result.ok) {
          toast.error(result.error ?? 'Could not create plan')
          return
        }
      } else {
        const ok = await persistPlanFlex(
          { planStartIndex: startIdx, claimedDayIndex: claimedIdx },
          perDay,
        )
        if (!ok) {
          toast.error('Could not save plan settings')
          return
        }
      }

      toast.success(hasPlan ? 'Plan updated' : 'Daily plan ready')
      onSaved()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={16} className="text-indigo-600" />
        <h2 className="text-sm font-bold text-indigo-900">Flexible daily plan</h2>
      </div>

      <p className="text-xs text-indigo-800/90 leading-relaxed mb-4">
        Pick where you are in the grind list. Everything before your start becomes <strong>catch-up</strong>.
        Do as many questions as you want each day - no fixed quota. Reviews start after you mark Set 1-3 questions done.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Start from plan day</span>
          <input
            type="number"
            min={1}
            max={totalDays}
            value={startDay}
            onChange={e => {
              const n = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
              setStartDay(n)
              if (todayDay < n) setTodayDay(n)
            }}
            className="mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums"
          />
          <span className="text-[10px] text-indigo-600/80 mt-1 block">
            Q{startIndex + 1} - {catchUpCount} catch-up
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Today is plan day</span>
          <input
            type="number"
            min={startDay}
            max={totalDays}
            value={todayDay}
            onChange={e => setTodayDay(Math.max(startDay, Number.parseInt(e.target.value, 10) || startDay))}
            className="mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums"
          />
          <span className="text-[10px] text-indigo-600/80 mt-1 block">
            ~{todayBlockCount} suggested today
          </span>
        </label>
      </div>

      <p className="text-[10px] text-indigo-700/70 mb-4">
        {totalDays} plan days total - {perDay} questions/day suggested - {questions.length} in grind order
      </p>

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-bold"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {existingStartDay != null ? 'Save plan' : 'Create plan'}
        </button>
      </div>
    </div>
  )
}

export { startIndexToDay }
