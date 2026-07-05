import {
  cacheGrindOfflineAssets,
  GRIND_OFFLINE_ASSETS,
  OFFLINE_PAGES,
} from '@/lib/offlinePages'
import { cacheAllDescriptionImages } from '@/lib/descriptionImageCache'

export const OFFLINE_WARMUP_KEY = 'lm_offline_warmup_v24'

export type WarmupPhase = 'pages' | 'done'

export type WarmupProgress = {
  phase: WarmupPhase
  label: string
  done: number
  total: number
}

export function isOfflineWarmupComplete(): boolean {
  if (typeof window === 'undefined') return true
  return !!localStorage.getItem(OFFLINE_WARMUP_KEY)
}

export function markOfflineWarmupComplete(status: 'done' | 'partial' | 'skipped-offline' | 'dev-skip' = 'done') {
  try {
    localStorage.setItem(OFFLINE_WARMUP_KEY, status === 'done' ? String(Date.now()) : status)
  } catch {
    /* ignore */
  }
}

function postCachePagesToSw() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then(reg => {
      const worker = reg.active || reg.waiting || reg.installing
      worker?.postMessage({ type: 'CACHE_PAGES', pages: [...OFFLINE_PAGES] })
      worker?.postMessage({ type: 'CACHE_GRIND_ASSETS' })
    })
    .catch(() => {})
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** One-time warm-up: cache offline Grind shell + question JSON + description images. */
export async function runOfflineWarmup(
  onProgress: (p: WarmupProgress) => void,
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOfflineWarmupComplete('skipped-offline')
    onProgress({ phase: 'done', label: 'Offline - skipped warm-up', done: 1, total: 1 })
    return
  }

  postCachePagesToSw()

  const pageTotal = 4 + GRIND_OFFLINE_ASSETS.length
  let done = 0

  const tick = (label: string) => {
    onProgress({ phase: 'pages', label, done, total: pageTotal })
  }

  tick('Loading question bank...')
  try { await fetch('/questions_full.json', { cache: 'reload' }) } catch { /* */ }
  done += 1

  tick('Saving problem descriptions...')
  try { await fetch('/questions_data_all.json', { cache: 'reload' }) } catch { /* */ }
  done += 1

  tick('Saving interview scripts...')
  try { await fetch('/playbook_data_all.json', { cache: 'reload' }) } catch { /* */ }
  done += 1

  tick('Saving description diagrams...')
  await cacheAllDescriptionImages((d, t) => {
    tick(`Saving description diagrams (${d}/${t})...`)
  })
  done += 1

  for (const path of GRIND_OFFLINE_ASSETS) {
    const label =
      path === '/grind-offline.html'
        ? 'Saving offline Grind page...'
        : path === '/grind-offline-editor.js'
          ? 'Saving code editor...'
          : 'Saving Grind question list...'
    tick(label)
    try { await fetch(path, { cache: 'reload' }) } catch { /* */ }
    done += 1
    await sleep(60)
  }

  tick('Writing offline cache...')
  await cacheGrindOfflineAssets()

  onProgress({ phase: 'done', label: 'Ready for offline use', done: pageTotal, total: pageTotal })
  markOfflineWarmupComplete('done')
}
