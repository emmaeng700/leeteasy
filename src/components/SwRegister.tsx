'use client'
import { useEffect } from 'react'
import { cacheAllDescriptionImages, descriptionImagesCached } from '@/lib/descriptionImageCache'
import { cacheGrindOfflineAssets, OFFLINE_PAGES } from '@/lib/offlinePages'
import { ensureCurrentBuild, purgeAppCaches, warmServiceWorker } from '@/lib/forceAppRefresh'

function cacheOfflinePages(registration: ServiceWorkerRegistration) {
  const worker = registration.active || registration.waiting || registration.installing
  if (!worker) return
  worker.postMessage({ type: 'CACHE_PAGES', pages: [...OFFLINE_PAGES] })
  worker.postMessage({ type: 'CACHE_GRIND_ASSETS' })
}

function warmDescriptionImages() {
  if (!navigator.onLine || descriptionImagesCached()) return
  void cacheAllDescriptionImages()
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')
}

async function purgeDevServiceWorker(): Promise<void> {
  await purgeAppCaches()
}

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (isLocalDevHost()) {
      void purgeDevServiceWorker()
      return
    }

    void (async () => {
      const reloading = await ensureCurrentBuild()
      if (reloading) return

      const reg = await warmServiceWorker().catch(() => null)
      if (!reg) return

      if (navigator.onLine) {
        cacheOfflinePages(reg)
        void cacheGrindOfflineAssets()
        warmDescriptionImages()
      }
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        next?.addEventListener('statechange', () => {
          if (next.state === 'activated' && navigator.onLine) {
            cacheOfflinePages(reg)
            void cacheGrindOfflineAssets()
            warmDescriptionImages()
          }
        })
      })
    })()

    const onOnline = () => {
      navigator.serviceWorker.ready
        .then(reg => {
          cacheOfflinePages(reg)
          warmDescriptionImages()
          return cacheGrindOfflineAssets()
        })
        .catch(() => {})
    }
    window.addEventListener('online', onOnline)

    return () => window.removeEventListener('online', onOnline)
  }, [])

  return null
}
