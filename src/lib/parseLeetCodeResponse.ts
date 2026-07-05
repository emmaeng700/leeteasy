/**
 * LeetCode HTTP APIs normally return JSON. They sometimes return HTML instead
 * (login wall, Cloudflare, rate limits, bad cookies). Calling `res.json()` on
 * that body throws: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 */

/** Strip BOM / trim before JSON.parse (some edges return \ufeff{...}). */
export function stripResponseForJson(text: string): string {
  return text.replace(/^\uFEFF/, '').trimStart()
}

export function isLeetCodeHtmlBody(text: string): boolean {
  const t = stripResponseForJson(text)
  const probe = t.slice(0, 80).toLowerCase()
  return (
    probe.startsWith('<!doctype') ||
    probe.startsWith('<html') ||
    (t.startsWith('<') && probe.includes('html'))
  )
}

export function parseLeetCodeJsonText(
  text: string,
  httpStatus: number,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const cleaned = stripResponseForJson(text)
  if (isLeetCodeHtmlBody(cleaned)) {
    return {
      ok: false,
      error: 'non_json_html',
    }
  }
  try {
    return { ok: true, data: JSON.parse(cleaned) as unknown }
  } catch {
    return {
      ok: false,
      error: `LeetCode sent a response that was not JSON (HTTP ${httpStatus}).`,
    }
  }
}
