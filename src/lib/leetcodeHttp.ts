import { isLeetCodeHtmlBody } from '@/lib/parseLeetCodeResponse'

const LC = 'https://leetcode.com'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const lcFetchInit: Pick<RequestInit, 'cache'> = { cache: 'no-store' }

/** LeetCode accepts numeric backend id; GraphQL often returns a string. */
export function toLeetCodeQuestionId(raw: unknown): number | string {
  const n = Number(raw)
  return Number.isFinite(n) ? n : String(raw ?? '')
}

const SET_COOKIE_ATTRS = new Set(['domain', 'path', 'expires', 'max-age', 'samesite'])

/** Cookie attribute from DevTools Application tab (Domain=, HttpOnly, Secure, etc.). */
export function isSetCookieAttribute(part: string): boolean {
  const t = part.trim()
  if (!t) return false
  if (!t.includes('=')) return /^(httponly|secure)$/i.test(t)
  return SET_COOKIE_ATTRS.has(t.split('=')[0].trim().toLowerCase())
}

/** Set-Cookie line copied from Application -> Cookies, not a request Cookie header. */
export function isSetCookieLine(raw: unknown): boolean {
  const s = String(raw ?? '').trim().replace(/^cookie:\s*/i, '')
  if (!/LEETCODE_SESSION\s*=/.test(s) || !s.includes(';')) return false
  const rest = s.split(';').slice(1).map(p => p.trim()).filter(Boolean)
  return rest.length > 0 && rest.every(isSetCookieAttribute)
}

/** Bare LEETCODE_SESSION JWT/value from any supported paste format. */
export function extractLeetCodeSessionValue(raw: unknown): string {
  let s = String(raw ?? '').trim().replace(/^cookie:\s*/i, '')
  if (!s) return ''

  const prefixed = s.match(/^LEETCODE_SESSION\s*=\s*([\s\S]+)$/i)
  if (prefixed) {
    const afterEq = prefixed[1].trim()
    const semi = afterEq.indexOf(';')
    if (semi === -1) return afterEq.replace(/^["']|["']$/g, '').trim()
    const value = afterEq.slice(0, semi).trim().replace(/^["']|["']$/g, '')
    const rest = afterEq.slice(semi + 1).split(';').map(p => p.trim()).filter(Boolean)
    if (rest.length === 0 || rest.every(isSetCookieAttribute)) return value
    return value
  }

  s = s.replace(/^["']|["']$/g, '').trim()
  return s
}

/** User pasted "LEETCODE_SESSION=..." value only, or added quotes/newlines — not a full cookie jar. */
export function normalizeLcCookieValue(raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  if (looksLikeLcCookieJar(s)) return s.replace(/^cookie:\s*/i, '').trim()
  if (isSetCookieLine(s) || /^LEETCODE_SESSION\s*=/i.test(s)) {
    return extractLeetCodeSessionValue(s)
  }
  const stripName = (name: string) => {
    const re = new RegExp(`^${name}\\s*=\\s*(.+)$`, 'i')
    const m = s.match(re)
    if (m) s = m[1].trim()
  }
  stripName('LEETCODE_SESSION')
  stripName('csrftoken')
  s = s.replace(/^["']|["']$/g, '').trim()
  return s
}

/** Request Cookie header with multiple cookies (csrftoken, cf_clearance, etc.). */
export function looksLikeLcCookieJar(raw: unknown): boolean {
  const s = String(raw ?? '').trim().replace(/^cookie:\s*/i, '')
  if (!/LEETCODE_SESSION\s*=/.test(s) || !s.includes(';')) return false
  if (isSetCookieLine(s)) return false
  return true
}

/** Fix sessions corrupted by an older bug that stripped the LEETCODE_SESSION= prefix. */
export function repairCorruptedCookieJar(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/^cookie:\s*/i, '').trim()
  if (!s || looksLikeLcCookieJar(s)) return s
  if (!s.includes(';')) return s
  const firstSemi = s.indexOf(';')
  const firstPart = s.slice(0, firstSemi).trim()
  const rest = s.slice(firstSemi + 1).trim()
  if (firstPart.includes('=')) return s
  if (/csrftoken=|cf_clearance=|__cf_bm=/i.test(rest)) {
    return `LEETCODE_SESSION=${firstPart}; ${rest}`
  }
  return s
}

/** Read session from localStorage/Supabase without corrupting a full Cookie header. */
export function parseStoredLcSession(rawSession: unknown, rawCsrf?: unknown): { session: string; csrf: string } {
  const session = repairCorruptedCookieJar(rawSession)
  if (!session) return { session: '', csrf: '' }
  if (looksLikeLcCookieJar(session)) {
    const jar = session.replace(/^cookie:\s*/i, '').trim()
    const csrf =
      normalizeLcCookieValue(rawCsrf) || getCookieFromHeader(jar, 'csrftoken')
    return { session: jar, csrf }
  }
  const csrf = normalizeLcCookieValue(rawCsrf) || ''
  return { session: extractLeetCodeSessionValue(session), csrf }
}

/**
 * Store session like LeetCodeMR: keep full Cookie header when pasted,
 * otherwise build LEETCODE_SESSION=...; csrftoken=...
 */
export function formatLcSessionJar(rawSession: unknown, csrf = ''): { jar: string; csrf: string } {
  const repaired = repairCorruptedCookieJar(String(rawSession ?? '').trim())
  if (!repaired) return { jar: '', csrf: '' }

  if (looksLikeLcCookieJar(repaired)) {
    const jar = repaired.replace(/^cookie:\s*/i, '').trim()
    const csrfFromJar = getCookieFromHeader(jar, 'csrftoken')
    return { jar, csrf: csrf || csrfFromJar }
  }

  const sessionValue = extractLeetCodeSessionValue(repaired)
  if (!sessionValue) return { jar: '', csrf: '' }

  const csrfToken = csrf || getCookieFromHeader(repaired, 'csrftoken')
  if (csrfToken) {
    return { jar: `LEETCODE_SESSION=${sessionValue}; csrftoken=${csrfToken}`, csrf: csrfToken }
  }
  return { jar: `LEETCODE_SESSION=${sessionValue}`, csrf: '' }
}

export function getCookieFromHeader(cookieHeaderRaw: string, name: string): string {
  const cookieHeader = String(cookieHeaderRaw ?? '').trim()
  if (!cookieHeader) return ''
  const normalized = cookieHeader.replace(/^cookie:\s*/i, '')
  const parts = normalized.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (!k) continue
    if (k.trim() === name) return rest.join('=').trim()
  }
  return ''
}

/** First name=value pair from a Set-Cookie response header. */
export function parseSetCookieHeaderValue(setCookie: string, name: string): string {
  const first = setCookie.split(';')[0]?.trim() ?? ''
  const eq = first.indexOf('=')
  if (eq < 0) return ''
  if (first.slice(0, eq).trim().toLowerCase() === name.toLowerCase()) {
    return first.slice(eq + 1).trim()
  }
  return ''
}

function readResponseSetCookies(res: Response): string[] {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie()
  }
  const raw = res.headers.get('set-cookie')
  return raw ? [raw] : []
}

function parseCsrfFromHtml(html: string): string {
  const patterns = [
    /name=['"]csrfmiddlewaretoken['"]\s+value=['"]([^'"]+)['"]/i,
    /['"]csrfToken['"]\s*:\s*['"]([^'"]+)['"]/,
    /['"]csrftoken['"]\s*:\s*['"]([^'"]+)['"]/,
    /csrftoken=([A-Za-z0-9]+)/,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
  return ''
}

/** Fetch csrftoken from leetcode.com when user saved LEETCODE_SESSION only. */
export async function bootstrapLcCsrf(rawSession: unknown): Promise<string> {
  const raw = String(rawSession ?? '').trim()
  if (!raw) return ''

  const fromJar = looksLikeLcCookieJar(raw) ? getCookieFromHeader(raw, 'csrftoken') : ''
  if (fromJar) return fromJar

  const sessionValue = extractLeetCodeSessionValue(raw)
  if (!sessionValue) return ''

  const cookie = `LEETCODE_SESSION=${sessionValue}`
  const urls = [
    `${LC}/`,
    `${LC}/problemset/`,
    `${LC}/accounts/login/`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: cookie,
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        ...lcFetchInit,
      })

      for (const h of readResponseSetCookies(res)) {
        const csrf = parseSetCookieHeaderValue(h, 'csrftoken')
        if (csrf) return csrf
      }

      const text = await res.text()
      const fromHtml = parseCsrfFromHtml(text)
      if (fromHtml) return fromHtml
    } catch {
      /* try next url */
    }
  }

  return ''
}

type WarmedCreds = { session: string; csrf: string; at: number }
const warmedCredsCache = new Map<string, WarmedCreds>()
const WARMED_CACHE_TTL_MS = 10 * 60 * 1000

function warmedCacheKey(rawSession: string): string {
  const v = extractLeetCodeSessionValue(rawSession) || rawSession.slice(0, 48)
  return v.slice(0, 48)
}

function readWarmedCreds(rawSession: string): WarmedCreds | null {
  const hit = warmedCredsCache.get(warmedCacheKey(rawSession))
  if (!hit || Date.now() - hit.at > WARMED_CACHE_TTL_MS) return null
  return hit
}

function storeWarmedCreds(rawSession: string, session: string, csrf: string) {
  if (!session || !csrf) return
  warmedCredsCache.set(warmedCacheKey(rawSession), { session, csrf, at: Date.now() })
}

/** Drop cached cookies after a 403 so the next Run/Submit re-warms from LeetCode. */
export function invalidateWarmedCreds(rawSession: string) {
  warmedCredsCache.delete(warmedCacheKey(rawSession))
}

/** Merge edge cookies from a LeetCode response into jar + csrf. */
export function absorbLcResponseCookies(
  jar: string,
  csrf: string,
  res: Response,
): { jar: string; csrf: string } {
  const nextJar = mergeSetCookiesIntoJar(jar, readResponseSetCookies(res))
  const nextCsrf = getCookieFromHeader(nextJar, 'csrftoken') || csrf
  return { jar: nextJar, csrf: nextCsrf }
}

/** Add or replace one cookie in a request Cookie header. */
export function mergeCookieIntoJar(jar: string, name: string, value: string): string {
  if (!value) return jar
  const parts = jar
    .split(';')
    .map(p => p.trim())
    .filter(p => {
      if (!p) return false
      const k = p.split('=')[0]?.trim()
      return k && k.toLowerCase() !== name.toLowerCase()
    })
  parts.push(`${name}=${value}`)
  return parts.join('; ')
}

function mergeSetCookiesIntoJar(jar: string, setCookies: string[]): string {
  let next = jar
  for (const h of setCookies) {
    const first = h.split(';')[0]?.trim() ?? ''
    const eq = first.indexOf('=')
    if (eq < 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (!name || !value) continue
    next = mergeCookieIntoJar(next, name, value)
  }
  return next
}

/**
 * Hit a few LeetCode pages with the session so Cloudflare / edge cookies
 * (cf_clearance, __cf_bm) are collected before Run/Submit.
 */
export async function warmLcCookieJar(rawSession: string, csrfToken: string): Promise<string> {
  const { cookie } = normalizeLcCookieHeader(rawSession, csrfToken)
  if (!cookie) return cookie

  let jar = cookie
  const urls = [
    `${LC}/`,
    `${LC}/problemset/`,
    `${LC}/api/problems/algorithms/`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: jar,
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${LC}/`,
          Origin: LC,
          'x-requested-with': 'XMLHttpRequest',
        },
        redirect: 'follow',
        ...lcFetchInit,
      })
      jar = mergeSetCookiesIntoJar(jar, readResponseSetCookies(res))
      if (hasCfClearance(jar)) return jar
    } catch {
      /* try next url */
    }
  }

  return jar
}

/** Visit the problem page so submit/interpret cookies are primed for that slug. */
export async function warmLcProblemPage(
  titleSlug: string,
  rawSession: string,
  csrfToken: string,
): Promise<string> {
  const { cookie } = normalizeLcCookieHeader(rawSession, csrfToken)
  if (!cookie) return cookie

  let jar = cookie
  const slug = encodeURIComponent(String(titleSlug))
  const urls = [
    `${LC}/problems/${slug}/description/`,
    `${LC}/problems/${slug}/`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: jar,
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${LC}/problemset/`,
          Origin: LC,
          'x-requested-with': 'XMLHttpRequest',
        },
        redirect: 'follow',
        ...lcFetchInit,
      })
      const absorbed = absorbLcResponseCookies(jar, csrfToken, res)
      jar = absorbed.jar
    } catch {
      /* try next url */
    }
  }

  return jar
}

/** Resolve session + csrf, bootstrapping csrftoken from LeetCode when needed. */
export async function resolveLcSessionCredentials(
  rawSession: unknown,
  rawCsrf?: unknown,
  opts?: { titleSlug?: string },
): Promise<{ session: string; csrf: string }> {
  const parsed = parseStoredLcSession(rawSession, rawCsrf)
  let session = parsed.session
  let csrf = parsed.csrf || getCookieFromHeader(session, 'csrftoken')

  const cached = session ? readWarmedCreds(session) : null
  if (cached) {
    session = cached.session
    csrf = cached.csrf
    if (opts?.titleSlug) {
      const problemJar = await warmLcProblemPage(opts.titleSlug, session, csrf)
      if (problemJar) session = problemJar
      const problemCsrf = getCookieFromHeader(problemJar, 'csrftoken')
      if (problemCsrf) csrf = problemCsrf
      storeWarmedCreds(parsed.session, session, csrf)
    }
    return { session, csrf }
  }

  if (session && !csrf) {
    csrf = await bootstrapLcCsrf(session)
  }
  if (session && csrf) {
    const warmed = await warmLcCookieJar(session, csrf)
    if (warmed) session = warmed
    const fromJar = getCookieFromHeader(warmed, 'csrftoken')
    if (fromJar) csrf = fromJar
    if (opts?.titleSlug) {
      const problemJar = await warmLcProblemPage(opts.titleSlug, session, csrf)
      if (problemJar) session = problemJar
      const problemCsrf = getCookieFromHeader(problemJar, 'csrftoken')
      if (problemCsrf) csrf = problemCsrf
    }
    storeWarmedCreds(parsed.session, session, csrf)
  }
  return { session, csrf }
}

export const LC_403_HINT =
  'Cloudflare blocked Run/Submit (HTTP 403). Your code was not judged. ' +
  'On leetcode.com open this problem, DevTools -> Network -> click Run there -> copy the full Cookie header from that request -> paste into Setup session -> Save -> retry here.'

/** True when a pasted cookie jar includes Cloudflare clearance (needed for Vercel Run/Submit). */
export function hasCfClearance(cookieHeaderRaw: string): boolean {
  return !!getCookieFromHeader(cookieHeaderRaw, 'cf_clearance')
}

/**
 * Normalize user input into a Cookie header string.
 * Accepts either:
 * - value-only LEETCODE_SESSION (and we’ll build the Cookie header)
 * - full cookie jar / "Cookie: ..." string containing LEETCODE_SESSION=...
 */
export function normalizeLcCookieHeader(rawSessionOrCookieJar: unknown, csrfToken: unknown): { cookie: string; csrf: string } {
  const raw = String(rawSessionOrCookieJar ?? '').trim()
  const rawCsrf = String(csrfToken ?? '').trim()

  if (looksLikeLcCookieJar(raw)) {
    const cookie = raw.replace(/^cookie:\s*/i, '').trim()
    const csrfFromJar = getCookieFromHeader(cookie, 'csrftoken')
    const csrf = normalizeLcCookieValue(rawCsrf) || normalizeLcCookieValue(csrfFromJar)
    return { cookie, csrf }
  }

  const sess = extractLeetCodeSessionValue(raw) || normalizeLcCookieValue(raw)
  const csrf = normalizeLcCookieValue(rawCsrf)
  return { cookie: `LEETCODE_SESSION=${sess}; csrftoken=${csrf}`, csrf }
}

export type LcProblemReferer = 'description' | 'problem-root'

export type LcPostStrategy = {
  referer: LcProblemReferer
  /** Match DevTools / python tools that send Sec-Fetch-* (helps some edge/WAF paths). */
  chromeHeaders?: boolean
  omitOrigin?: boolean
}

/** Browser-like headers for JSON POST to LeetCode problem APIs (submit / run). */
export function leetCodeProblemApiHeaders(
  titleSlug: string,
  session: string,
  csrfToken: string,
  opts?: LcPostStrategy,
): Record<string, string> {
  const { cookie, csrf } = normalizeLcCookieHeader(session, csrfToken)
  const slug = encodeURIComponent(titleSlug)
  const refPath =
    (opts?.referer ?? 'description') === 'description'
      ? `${slug}/description/`
      : `${slug}/`
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-CSRFToken': csrf,
    Referer: `${LC}/problems/${refPath}`,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-requested-with': 'XMLHttpRequest',
    'User-Agent': UA,
  }
  if (!opts?.omitOrigin) {
    base.Origin = LC
  }
  if (opts?.chromeHeaders) {
    base['Sec-Fetch-Dest'] = 'empty'
    base['Sec-Fetch-Mode'] = 'cors'
    base['Sec-Fetch-Site'] = 'same-origin'
    base['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
    base['sec-ch-ua-mobile'] = '?0'
    base['sec-ch-ua-platform'] = '"macOS"'
    base['Accept-Encoding'] = 'gzip, deflate, br, zstd'
  }
  return base
}

export function leetCodeGraphqlHeaders(session: string, csrfToken: string): Record<string, string> {
  const { cookie, csrf } = normalizeLcCookieHeader(session, csrfToken)
  return {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-CSRFToken': csrf,
    Referer: `${LC}/problems/`,
    Origin: LC,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-requested-with': 'XMLHttpRequest',
    'User-Agent': UA,
  }
}

export function leetCodeCheckHeaders(
  titleSlug: string,
  session: string,
  csrfToken: string,
  opts?: { referer?: LcProblemReferer; chromeHeaders?: boolean },
): Record<string, string> {
  const { cookie } = normalizeLcCookieHeader(session, csrfToken)
  const slug = encodeURIComponent(titleSlug)
  const refPath =
    (opts?.referer ?? 'description') === 'description'
      ? `${slug}/description/`
      : `${slug}/`
  const base: Record<string, string> = {
    Cookie: cookie,
    Referer: `${LC}/problems/${refPath}`,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-requested-with': 'XMLHttpRequest',
    'User-Agent': UA,
  }
  if (opts?.chromeHeaders) {
    base['Sec-Fetch-Dest'] = 'empty'
    base['Sec-Fetch-Mode'] = 'cors'
    base['Sec-Fetch-Site'] = 'same-origin'
    base['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
    base['sec-ch-ua-mobile'] = '?0'
    base['sec-ch-ua-platform'] = '"macOS"'
    base['Accept-Encoding'] = 'gzip, deflate, br, zstd'
  }
  return base
}

const RETRY_MS = 450

const POST_STRATEGIES: LcPostStrategy[] = [
  { referer: 'description' },
  { referer: 'problem-root' },
  { referer: 'description', chromeHeaders: true },
  { referer: 'problem-root', chromeHeaders: true },
  { referer: 'description', omitOrigin: true },
  { referer: 'problem-root', omitOrigin: true },
]

function strategyKey(s: LcPostStrategy): string {
  return `${s.referer}|${s.chromeHeaders ? 1 : 0}|${s.omitOrigin ? 1 : 0}`
}

function pickPostStrategies(preferred?: LcPostStrategy): LcPostStrategy[] {
  if (!preferred) return POST_STRATEGIES
  const key = strategyKey(preferred)
  const rest = POST_STRATEGIES.filter(s => strategyKey(s) !== key)
  return [preferred, ...rest]
}

/** @deprecated Internal helper; kept exported so stale dev caches do not break. */
export function orderStrategies(preferred?: LcPostStrategy): LcPostStrategy[] {
  return pickPostStrategies(preferred)
}

function responseLooksGood(text: string, status: number): boolean {
  return status !== 403 && !isLeetCodeHtmlBody(text)
}

/**
 * POST to submit/interpret_solution. Retries with alternate Referer / headers if HTML
 * (login wall, transient edge) — matches patterns used by working CLI/python tools.
 */
export async function fetchLeetCodeProblemPost(
  fullUrl: string,
  jsonBody: object,
  titleSlug: string,
  session: string,
  csrf: string,
  opts?: { retryOnHtml?: boolean; preferredStrategy?: LcPostStrategy },
): Promise<{ res: Response; text: string; session: string; csrf: string; winStrategy?: LcPostStrategy }> {
  const strategies = pickPostStrategies(opts?.preferredStrategy)
  let jar = session
  let csrfToken = csrf
  let last: { res: Response; text: string } | null = null
  let winStrategy: LcPostStrategy | undefined
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i]
    const headers = leetCodeProblemApiHeaders(titleSlug, jar, csrfToken, strategy)
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonBody),
      ...lcFetchInit,
    })
    const text = await res.text()
    last = { res, text }
    const absorbed = absorbLcResponseCookies(jar, csrfToken, res)
    jar = absorbed.jar
    csrfToken = absorbed.csrf
    storeWarmedCreds(session, jar, csrfToken)
    if (!winStrategy && responseLooksGood(text, res.status)) {
      winStrategy = strategy
    }
    if (res.status === 429 || res.status === 401) {
      return { ...last, session: jar, csrf: csrfToken, winStrategy }
    }
    const isLast = i === strategies.length - 1
    if (isLast) return { ...last, session: jar, csrf: csrfToken, winStrategy }
    if (res.status !== 403 && !isLeetCodeHtmlBody(text)) {
      return { ...last, session: jar, csrf: csrfToken, winStrategy }
    }
    await new Promise(r => setTimeout(r, RETRY_MS))
  }
  return { ...last!, session: jar, csrf: csrfToken, winStrategy }
}

const CHECK_STRATEGIES: Array<{ referer: LcProblemReferer; chromeHeaders?: boolean }> = [
  { referer: 'description' },
  { referer: 'problem-root' },
  { referer: 'description', chromeHeaders: true },
]

/** GET check/ poll — retry on HTML with alternate Referer / headers. */
export async function fetchLeetCodeCheckGet(
  fullUrl: string,
  titleSlug: string,
  session: string,
  csrf: string,
): Promise<{ res: Response; text: string }> {
  let last: { res: Response; text: string } | null = null
  for (let i = 0; i < CHECK_STRATEGIES.length; i++) {
    const s = CHECK_STRATEGIES[i]
    const headers = leetCodeCheckHeaders(titleSlug, session, csrf, s)
    const res = await fetch(fullUrl, { headers, ...lcFetchInit })
    const text = await res.text()
    last = { res, text }
    if (res.status === 429 || res.status === 401) return last
    const isLast = i === CHECK_STRATEGIES.length - 1
    if (isLast) return last
    if (res.status !== 403 && !isLeetCodeHtmlBody(text)) return last
    await new Promise(r => setTimeout(r, RETRY_MS))
  }
  return last!
}
