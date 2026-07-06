/** Draft LeetCode session/csrf while pasting - survives tab switches until Save. */

const SESSION_DRAFT = 'leteasy_lc_session_draft'
const CSRF_DRAFT = 'leteasy_lc_csrf_draft'
const TOKEN_LABEL_DRAFT = 'leteasy_token_label_draft'
const TOKEN_CLEANED_DRAFT = 'leteasy_token_cleaned_draft'

function ss(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

export function readLcPasteDraft(): { session: string; csrf: string } {
  const store = ss()
  if (!store) return { session: '', csrf: '' }
  return {
    session: store.getItem(SESSION_DRAFT) ?? '',
    csrf: store.getItem(CSRF_DRAFT) ?? '',
  }
}

export function writeLcPasteDraft(session: string, csrf: string): void {
  const store = ss()
  if (!store) return
  if (session) store.setItem(SESSION_DRAFT, session)
  else store.removeItem(SESSION_DRAFT)
  if (csrf) store.setItem(CSRF_DRAFT, csrf)
  else store.removeItem(CSRF_DRAFT)
}

export function readTokenCleanerDraft(): { raw: string; cleaned: string; label: string } {
  const store = ss()
  const shared = readLcPasteDraft()
  if (!store) return { raw: shared.session, cleaned: '', label: 'LeetCode Session' }
  return {
    raw: shared.session,
    cleaned: store.getItem(TOKEN_CLEANED_DRAFT) ?? '',
    label: store.getItem(TOKEN_LABEL_DRAFT) ?? 'LeetCode Session',
  }
}

export function writeTokenCleanerDraft(raw: string, cleaned: string, label: string): void {
  const store = ss()
  if (!store) return
  writeLcPasteDraft(raw, readLcPasteDraft().csrf)
  if (cleaned) store.setItem(TOKEN_CLEANED_DRAFT, cleaned)
  else store.removeItem(TOKEN_CLEANED_DRAFT)
  if (label) store.setItem(TOKEN_LABEL_DRAFT, label)
  else store.removeItem(TOKEN_LABEL_DRAFT)
}

export function clearLcPasteDraft(): void {
  const store = ss()
  if (!store) return
  store.removeItem(SESSION_DRAFT)
  store.removeItem(CSRF_DRAFT)
  store.removeItem(TOKEN_CLEANED_DRAFT)
}

export function clearTokenCleanerDraft(): void {
  clearLcPasteDraft()
  const store = ss()
  if (!store) return
  store.removeItem(TOKEN_LABEL_DRAFT)
}
