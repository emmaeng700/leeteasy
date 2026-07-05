export const DESC_IMAGES_MANIFEST = '/description-images-manifest.json'
export const DESC_IMAGES_CACHE_KEY = 'lm_desc_images_cached_v1'

export async function loadDescriptionImagePaths(): Promise<string[]> {
  try {
    const res = await fetch(DESC_IMAGES_MANIFEST, { cache: 'reload' })
    if (res.ok) {
      const paths = (await res.json()) as string[]
      if (Array.isArray(paths) && paths.length > 0) return paths
    }
  } catch {
    /* offline or network error */
  }

  if (typeof caches !== 'undefined') {
    for (const cacheName of ['lm-v26', 'lm-v25', 'lm-v24', 'lm-v23', 'lm-v22', 'lm-v21', 'lm-v20', 'lm-v16', 'lm-v15', 'lm-v13']) {
      try {
        const cache = await caches.open(cacheName)
        const cached = await cache.match(DESC_IMAGES_MANIFEST, { ignoreSearch: true })
        if (cached) {
          const paths = (await cached.json()) as string[]
          if (Array.isArray(paths) && paths.length > 0) return paths
        }
      } catch {
        /* ignore */
      }
    }
  }

  return []
}

async function cachePathsDirect(paths: string[], onProgress?: (done: number, total: number) => void) {
  if (!('caches' in window)) return 0
  const cache = await caches.open('lm-images')
  const opts = { ignoreSearch: true, ignoreVary: true }
  let cached = 0
  const batch = 10
  for (let i = 0; i < paths.length; i += batch) {
    const slice = paths.slice(i, i + batch)
    await Promise.all(
      slice.map(async path => {
        try {
          if (await cache.match(path, opts)) {
            cached++
            return
          }
          const res = await fetch(path, { cache: 'reload' })
          if (res.ok) {
            await cache.put(path, res.clone())
            cached++
          }
        } catch {
          /* ignore */
        }
      }),
    )
    onProgress?.(Math.min(i + batch, paths.length), paths.length)
  }
  return cached
}

/** Cache every /description-images asset for offline Grind. */
export async function cacheAllDescriptionImages(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (typeof window === 'undefined' || !navigator.onLine) return 0

  const paths = await loadDescriptionImagePaths()
  if (paths.length === 0) return 0

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      const worker = reg.active || reg.waiting || reg.installing
      if (worker) {
        await new Promise<void>(resolve => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            navigator.serviceWorker.removeEventListener('message', onMsg)
            resolve()
          }
          const onMsg = (ev: MessageEvent) => {
            const data = ev.data as { type?: string; done?: number; total?: number }
            if (data?.type === 'DESC_IMG_PROGRESS' && data.done != null && data.total != null) {
              onProgress?.(data.done, data.total)
            }
            if (data?.type === 'DESC_IMG_DONE') finish()
          }
          navigator.serviceWorker.addEventListener('message', onMsg)
          worker.postMessage({ type: 'CACHE_DESCRIPTION_IMAGES', paths })
          setTimeout(finish, 180_000)
        })
        try {
          localStorage.setItem(DESC_IMAGES_CACHE_KEY, String(Date.now()))
        } catch {
          /* ignore */
        }
        return paths.length
      }
    } catch {
      /* fall through */
    }
  }

  const n = await cachePathsDirect(paths, onProgress)
  try {
    localStorage.setItem(DESC_IMAGES_CACHE_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  return n
}

export function descriptionImagesCached(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return !!localStorage.getItem(DESC_IMAGES_CACHE_KEY)
  } catch {
    return false
  }
}
