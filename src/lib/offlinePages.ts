/** Service worker cache name - keep in sync with public/sw-v26.js */
export const SW_CACHE = 'lm-v26'

/** Static assets precached for offline Grind (see public/sw-v16.js). */
export const OFFLINE_PAGES = ['/grind-offline.html'] as const

export const GRIND_OFFLINE_PATH = '/grind-offline.html'

export const GRIND_OFFLINE_ASSETS = [
  '/grind-offline.html',
  '/grind-offline-editor.js',
  '/grind_questions.json',
  '/questions_data_all.json',
  '/description-images-manifest.json',
] as const

/** Links shown on public/offline.html */
export const OFFLINE_NAV_LINKS: { href: string; emoji: string; label: string }[] = [
  { href: GRIND_OFFLINE_PATH, label: 'Grind', emoji: 'G' },
]

/** Put offline Grind HTML + question list into the SW cache (works from the page too). */
export async function cacheGrindOfflineAssets(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false
  try {
    const cache = await caches.open(SW_CACHE)
    let ok = true
    for (const url of GRIND_OFFLINE_ASSETS) {
      const res = await fetch(url, { cache: 'reload' })
      if (!res.ok) {
        ok = false
        continue
      }
      await cache.put(url, res.clone())
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      const worker = reg.active || reg.waiting || reg.installing
      worker?.postMessage({ type: 'CACHE_GRIND_ASSETS' })
    }
    return ok
  } catch {
    return false
  }
}
