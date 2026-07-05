const LEETCODE_SLUG_FIX_BY_QUESTION_ID: Record<number, string> = {
  787: 'cheapest-flights-within-k-stops',
  2675: 'array-of-objects-to-matrix',
}

export function resolveLeetCodeSlug(questionId: number, slug: string | null | undefined): string {
  const raw = String(slug ?? '').trim()
  return LEETCODE_SLUG_FIX_BY_QUESTION_ID[questionId] ?? raw
}

/** Opens in LeetCode app on mobile when installed. */
export function leetCodeUrl(slug: string | null | undefined): string {
  const s = String(slug ?? '').trim()
  if (!s) return 'https://leetcode.com/problemset/all/'
  return `https://leetcode.com/problems/${encodeURIComponent(s)}/`
}

export function srInterval(n: number): number {
  const LADDER = [1, 3, 7]
  if (!Number.isFinite(n) || n < 0) return LADDER[0]
  return LADDER[Math.min(n, LADDER.length - 1)]
}
