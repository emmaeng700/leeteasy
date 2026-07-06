import { getCookieFromHeader, parseStoredLcSession, formatLcSessionJar } from '@/lib/leetcodeHttp'
import { resolveLeetCodeSlug } from '@/lib/utils'

export const LC_LIST_SYNC_KEY = 'leteasy_lc_sync'

export type LcListSyncState = {
  syncedAt: string
  solvedIds: number[]
  bySlug: Record<string, number>
  /** Unique problems with AC on LeetCode (all slugs from submission history). */
  totalAcProblems: number
  /** AC problems that match the grind list (Sets 1-3). */
  grindAcCount: number
  /** AC on LeetCode but not in the grind list. */
  extraAcCount: number
}

function normalizeSyncState(parsed: Partial<LcListSyncState>): LcListSyncState | null {
  if (!parsed?.syncedAt) return null
  const bySlug = parsed.bySlug ?? {}
  const solvedIds = Array.isArray(parsed.solvedIds) ? parsed.solvedIds : []
  const totalAcProblems = parsed.totalAcProblems ?? Object.values(bySlug).filter(c => c >= 1).length
  const grindAcCount = parsed.grindAcCount ?? solvedIds.length
  const extraAcCount = parsed.extraAcCount ?? Math.max(0, totalAcProblems - grindAcCount)
  return {
    syncedAt: parsed.syncedAt,
    solvedIds,
    bySlug,
    totalAcProblems,
    grindAcCount,
    extraAcCount,
  }
}

export function readLcListSync(): LcListSyncState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LC_LIST_SYNC_KEY)
    if (!raw) return null
    return normalizeSyncState(JSON.parse(raw) as Partial<LcListSyncState>)
  } catch {
    return null
  }
}

export function writeLcListSync(state: LcListSyncState): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LC_LIST_SYNC_KEY, JSON.stringify(state))
}

/** Write local cache + Supabase (every successful sync). */
export async function persistLcListSync(state: LcListSyncState): Promise<void> {
  writeLcListSync(state)
  try {
    await fetch('/api/leetcode/list-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
  } catch { /* local copy still valid */ }
}

function newerSync(a: LcListSyncState | null, b: LcListSyncState | null): LcListSyncState | null {
  if (!a) return b
  if (!b) return a
  const at = Date.parse(a.syncedAt)
  const bt = Date.parse(b.syncedAt)
  if (!Number.isFinite(at) && !Number.isFinite(bt)) return b
  if (!Number.isFinite(at)) return b
  if (!Number.isFinite(bt)) return a
  return bt >= at ? b : a
}

/** Merge local + Supabase; keep whichever syncedAt is latest. */
export async function hydrateLcListSync(): Promise<LcListSyncState | null> {
  const local = readLcListSync()
  let remote: LcListSyncState | null = null
  try {
    const r = await fetch('/api/leetcode/list-sync', { cache: 'no-store' })
    const d = await r.json() as { state?: Partial<LcListSyncState> | null }
    remote = d.state ? normalizeSyncState(d.state) : null
  } catch { /* ignore */ }

  const winner = newerSync(local, remote)
  if (!winner) return null

  writeLcListSync(winner)
  if (local && winner === local && (!remote || Date.parse(local.syncedAt) > Date.parse(remote.syncedAt))) {
    void persistLcListSync(local)
  }
  return winner
}

export async function loadLcSessionForSync(): Promise<{ session: string; csrf: string }> {
  const fromLocal = parseStoredLcSession(
    localStorage.getItem('lc_session'),
    localStorage.getItem('lc_csrf'),
  )
  let session = fromLocal.session
  let csrf = fromLocal.csrf || getCookieFromHeader(fromLocal.session, 'csrftoken')

  if (!session) {
    try {
      const d = await fetch('/api/lc-session').then(r => r.json()) as { lc_session?: string; lc_csrf?: string }
      const parsed = parseStoredLcSession(d.lc_session, d.lc_csrf)
      session = parsed.session
      csrf = parsed.csrf || getCookieFromHeader(parsed.session, 'csrftoken')
      if (session) {
        const { jar, csrf: jarCsrf } = formatLcSessionJar(d.lc_session ?? session, csrf)
        localStorage.setItem('lc_session', jar)
        session = jar
        const finalCsrf = jarCsrf || csrf
        csrf = finalCsrf
        if (finalCsrf) localStorage.setItem('lc_csrf', finalCsrf)
      }
    } catch { /* ignore */ }
  }

  if (session && !csrf) {
    try {
      const r = await fetch('/api/lc-csrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      })
      const d = await r.json() as { csrf?: string }
      csrf = d.csrf ?? ''
    } catch { /* ignore */ }
  }

  if (session && typeof window !== 'undefined') {
    const { jar, csrf: jarCsrf } = formatLcSessionJar(
      localStorage.getItem('lc_session') || session,
      csrf,
    )
    localStorage.setItem('lc_session', jar)
    csrf = jarCsrf || csrf
    if (csrf) localStorage.setItem('lc_csrf', csrf)
  }

  return { session: typeof window !== 'undefined' ? (localStorage.getItem('lc_session') || session) : session, csrf }
}

/** Load session from local/Supabase; if missing, auto-apply newest Tokens clipboard entry. */
export async function ensureLcSessionForSync(): Promise<{ session: string; csrf: string }> {
  let creds = await loadLcSessionForSync()
  if (creds.session) return creds

  try {
    const r = await fetch('/api/clipboard', { cache: 'no-store' })
    const d = await r.json() as { items?: Array<{ is_token: boolean; content: string }> }
    const token = (d.items ?? []).find(i => i.is_token && i.content?.trim())
    if (token) {
      await persistLcSessionFromPaste(token.content)
      creds = await loadLcSessionForSync()
    }
  } catch { /* ignore */ }

  return creds
}

/** Save LeetCode cookie to localStorage + Supabase (clipboard, paste panel, etc.). */
export async function persistLcSessionFromPaste(
  rawSession: string,
  rawCsrf = '',
): Promise<{ session: string; csrf: string; ok: boolean }> {
  const parsed = parseStoredLcSession(rawSession, rawCsrf)
  if (!parsed.session) return { session: '', csrf: '', ok: false }

  let csrf = parsed.csrf || getCookieFromHeader(rawSession, 'csrftoken')
  if (!csrf) {
    try {
      const r = await fetch('/api/lc-csrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: rawSession }),
      })
      const d = await r.json() as { csrf?: string }
      csrf = d.csrf ?? ''
    } catch { /* ignore */ }
  }

  const { jar, csrf: finalCsrf } = formatLcSessionJar(rawSession, csrf)
  if (!jar) return { session: '', csrf: '', ok: false }
  csrf = finalCsrf

  if (typeof window !== 'undefined') {
    localStorage.setItem('lc_session', jar)
    if (csrf) localStorage.setItem('lc_csrf', csrf)
  }

  try {
    const res = await fetch('/api/lc-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lc_session: jar, lc_csrf: csrf }),
    })
    if (!res.ok) {
      // Local session still usable for sync on this device
      return { session: jar, csrf, ok: true }
    }
  } catch {
    return { session: jar, csrf, ok: true }
  }

  return { session: jar, csrf, ok: true }
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
  if (!session) {
    return { bySlug: {}, error: 'no_session' }
  }

  const res = await fetch('/api/leetcode/ac-counts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, csrfToken: csrf || '' }),
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
): Promise<{
  solvedIds: number[]
  bySlug: Record<string, number>
  totalAcProblems: number
  grindAcCount: number
  extraAcCount: number
  error?: string
}> {
  const { bySlug, error } = await fetchAcBySlug(session, csrf)
  if (error) {
    return { solvedIds: [], bySlug: {}, totalAcProblems: 0, grindAcCount: 0, extraAcCount: 0, error }
  }

  const slugToId = buildSlugToIdMap(questions)
  const grindSlugs = new Set(slugToId.keys())
  const solvedIds = new Set<number>()

  for (const [slug, count] of Object.entries(bySlug)) {
    if (count < 1) continue
    const id = slugToId.get(slug)
    if (id != null) {
      solvedIds.add(id)
    }
  }

  const acSlugs = Object.entries(bySlug).filter(([, c]) => c >= 1).map(([s]) => s)
  const totalAcProblems = acSlugs.length
  const extraAcCount = acSlugs.filter(s => !grindSlugs.has(s)).length

  const state: LcListSyncState = {
    syncedAt: new Date().toISOString(),
    solvedIds: Array.from(solvedIds).sort((a, b) => a - b),
    bySlug,
    totalAcProblems,
    grindAcCount: solvedIds.size,
    extraAcCount,
  }
  await persistLcListSync(state)
  return {
    solvedIds: state.solvedIds,
    bySlug,
    totalAcProblems,
    grindAcCount: state.grindAcCount,
    extraAcCount,
  }
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
