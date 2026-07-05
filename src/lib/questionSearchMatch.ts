/** Match by LeetCode id or title substring (case-insensitive). */
export function matchesQuestionSearch(
  q: { id: number; title: string },
  search: string,
): boolean {
  const raw = search.trim()
  if (!raw) return true
  const s = raw.toLowerCase()
  const byId = s.replace(/^#/, '')
  return q.title.toLowerCase().includes(s) || String(q.id).includes(byId)
}
