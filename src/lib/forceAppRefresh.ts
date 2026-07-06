import { APP_BUILD_ID, SW_SCRIPT } from '@/lib/appVersion'

const BUILD_KEY = 'leeteasy_build_id'
const RELOAD_KEY = 'leeteasy_refreshing'

export async function purgeAppCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(reg => reg.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
  }
}

/** Unregister SW, wipe caches, bump stored build id, hard-reload. */
export async function forceAppRefresh(): Promise<void> {
  await purgeAppCaches()
  try {
    localStorage.setItem(BUILD_KEY, APP_BUILD_ID)
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    /* private mode */
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_v', String(Date.now()))
  window.location.replace(url.toString())
}

export function clearRefreshQueryParam(): void {
  try {
    if (!sessionStorage.getItem(RELOAD_KEY)) return
    sessionStorage.removeItem(RELOAD_KEY)
    const url = new URL(window.location.href)
    if (!url.searchParams.has('_v')) return
    url.searchParams.delete('_v')
    window.history.replaceState({}, '', url.toString())
  } catch {
    /* ignore */
  }
}

export async function ensureCurrentBuild(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return false
  }

  let stored: string | null = null
  try {
    stored = localStorage.getItem(BUILD_KEY)
  } catch {
    return false
  }

  if (stored === APP_BUILD_ID) return false

  if (sessionStorage.getItem(RELOAD_KEY)) {
    try {
      localStorage.setItem(BUILD_KEY, APP_BUILD_ID)
      sessionStorage.removeItem(RELOAD_KEY)
    } catch {
      /* ignore */
    }
    return false
  }

  await forceAppRefresh()
  return true
}

export async function warmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return null

  await fetch('/sw.js', { cache: 'no-store' }).catch(() => {})
  await fetch(SW_SCRIPT, { cache: 'no-store' }).catch(() => {})
  const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  await reg.update().catch(() => {})
  return reg
}
