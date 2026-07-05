import { getCookieFromHeader, parseStoredLcSession } from '@/lib/leetcodeHttp'
import { resolveLeetCodeSlug } from '@/lib/utils'

export const LC_LIST_SYNC_KEY = 'leteasy_lc_sync'

export type LcListSyncState = {
  syncedAt: string
  solvedIds: number[]
  bySlug: Record<string, number>
}

export function readLcListSync(): LcListSyncState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LC_LIST_SYNC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LcListSyncState
    if (!parsed?.syncedAt) return null
    return {
      syncedAt: parsed.syncedAt,
      solvedIds: Array.isArray(parsed.solvedIds) ? parsed.solvedIds : [],
      bySlug: parsed.bySlug ?? {},
    }
  } catch {
    return null
  }
}

export function writeLcListSync(state: LcListSyncState): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LC_LIST_SYNC_KEY, JSON.stringify(state))
}

export async function loadLcSessionForSync(): Promise<{ session: string; csrf: string }> {
  const fromLocal = parseStoredLcSession(
    localStorage.getItem('lc_session'),
    localStorage.getItem('lc_csrf'),
  )
  let session = fromLocal.session
  let csrf = fromLocal.csrf || getCookieFromHeader(fromLocal.session, 'csrftoken')

  if (!session) {
    return { session: '', csrf: '' }
  }

  return { session, csrf }
}

function buildSlugToIdMap(questions: Array<{ id: number; slug: string }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const q of questions) {
    map.set(q.slug, q.id)
    map.set(resolveLeetCodeSlug(q.id, q.slug), q.id)
  }
  return map
}

export async function fetchAcBySlug(session: string, csrf: string): Promise<{
  bySlug: Record<string, number>
  error?: string
}> {
  if (!session || !csrf) {
    return { bySlug: {}, error: 'no_session' }
  }

  const res = await fetch('/api/leetcode/ac-counts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, csrfToken: csrf }),
  })

  const data = await res.json() as { bySlug?: Record<string, number>; error?: string }
  if (!res.ok || data.error) {
    return { bySlug: {}, error: data.error ?? 'Sync failed' }
  }
  return { bySlug: data.bySlug ?? {} }
}

export async function syncLeetCodeAccepted(
  questions: Array<{ id: number; slug: string }>,
  session: string,
  csrf: string,
): Promise<{ solvedIds: number[]; bySlug: Record<string, number>; error?: string }> {
  const { bySlug, error } = await fetchAcBySlug(session, csrf)
  if (error) return { solvedIds: [], bySlug: {}, error }

  const slugToId = buildSlugToIdMap(questions)
  const solvedIds = new Set<number>()
  for (const [slug, count] of Object.entries(bySlug)) {
    if (count < 1) continue
    const id = slugToId.get(slug)
    if (id != null) solvedIds.add(id)
  }

  const state: LcListSyncState = {
    syncedAt: new Date().toISOString(),
    solvedIds: Array.from(solvedIds).sort((a, b) => a - b),
    bySlug,
  }
  writeLcListSync(state)
  return { solvedIds: state.solvedIds, bySlug }
}

export function formatSyncTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}
