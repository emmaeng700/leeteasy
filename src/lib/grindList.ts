import type { GrindQuestion } from './grindQuestions'

export type GrindListEntry =
  | { type: 'divider'; label: string; key: string; variant: 'set' | 'section' }
  | { type: 'question'; q: GrindQuestion; key: string }

/** Sidebar rows with Set + study-order section dividers (matches PDF rounds). */
export function grindListWithDividers(questions: GrindQuestion[]): GrindListEntry[] {
  const out: GrindListEntry[] = []
  let lastSet = 0
  let lastSection: string | null = null

  for (const q of questions) {
    if (q.set !== lastSet) {
      out.push({
        type: 'divider',
        label: q.set === 1 ? 'Set 1 - Main 331' : q.set === 2 ? 'Set 2 - NeetCode 250' : 'Set 3 - AlgoMaster 600',
        key: `set-${q.set}`,
        variant: 'set',
      })
      lastSet = q.set
      lastSection = null
    }
    if (q.section && q.section !== lastSection) {
      out.push({
        type: 'divider',
        label: q.section,
        key: `sec-${q.set}-${q.section}`,
        variant: 'section',
      })
      lastSection = q.section
    }
    out.push({ type: 'question', q, key: `q-${q.set}-${q.id}` })
  }

  return out
}
