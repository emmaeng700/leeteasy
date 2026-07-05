import { PATTERN_PRIORITY } from '@/lib/constants'

const STYLES = {
  High: 'bg-red-100 text-red-600 border-red-300',
  Mid:  'bg-amber-100 text-amber-600 border-amber-300',
  Low:  'bg-gray-100 text-gray-500 border-gray-300',
} as const

const STYLES_ACTIVE = 'bg-white/25 text-white border-white/40'

interface Props {
  pattern: string
  active?: boolean
  className?: string
}

export default function PriorityBadge({ pattern, active = false, className = '' }: Props) {
  const priority = PATTERN_PRIORITY[pattern]
  if (!priority) return null
  return (
    <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border leading-none ${
      active ? STYLES_ACTIVE : STYLES[priority]
    } ${className}`}>
      {priority}
    </span>
  )
}
