const CACHE     = 'lm-v27'
const IMG_CACHE = 'lm-images'

const GRIND_OFFLINE = '/grind-offline.html'
const GRIND_QUESTIONS = '/grind_questions.json'

const GRIND_EDITOR = '/grind-offline-editor.js'

const GRIND_ASSETS = [GRIND_OFFLINE, GRIND_EDITOR, GRIND_QUESTIONS, '/questions_data_all.json']

function offlineShellPath(pathname) {
  const p = pathname.replace(/\/$/, '') || '/'
  if (p === GRIND_OFFLINE) return GRIND_OFFLINE
  if (p.startsWith('/grind')) return GRIND_OFFLINE
  return null
}

const PRECACHE = [
  '/offline.html',
  GRIND_OFFLINE,
  GRIND_EDITOR,
  GRIND_QUESTIONS,
  '/questions_full.json',
  '/playbook_data_all.json',
  '/questions_data_all.json',
  '/description-images-manifest.json',
  '/behavioral_questions.json',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Offline - LeetMastery</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#f9fafb;min-height:100vh;display:flex;align-items:center;
         justify-content:center;padding:1.5rem}
    .card{background:#fff;border-radius:1.25rem;padding:2rem 1.75rem;
          max-width:380px;width:100%;text-align:center;
          box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .icon{width:52px;height:52px;background:#ecfdf5;border-radius:1rem;
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 1rem;font-size:1.6rem}
    h1{font-size:1.1rem;font-weight:700;color:#111827;margin-bottom:.4rem}
    p{font-size:.85rem;color:#6b7280;line-height:1.6;margin-bottom:1.25rem}
    .btn{background:#059669;color:#fff;border:none;border-radius:.75rem;
         padding:.75rem 1.25rem;font-size:.9rem;font-weight:600;
         cursor:pointer;width:100%;margin-bottom:.5rem}
    .btn-secondary{background:#f3f4f6;color:#374151;font-weight:500}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#128225;</div>
    <h1>You're offline</h1>
    <p>Grind still works without internet. Write code from memory on all 727 questions.</p>
    <button type="button" class="btn" id="open-grind">Grind - write code offline</button>
    <button type="button" class="btn btn-secondary" id="go-back">Go back</button>
  </div>
  <script>
    document.getElementById('open-grind').onclick=function(){window.location.assign('/grind-offline.html')}
    document.getElementById('go-back').onclick=function(){history.length>1?history.back():window.location.assign('/grind-offline.html')}
  </script>
</body>
</html>`

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function cacheGet(url, request) {
  const cache = await caches.open(CACHE)
  const opts = { ignoreSearch: true, ignoreVary: true }
  if (request) {
    const hit = await cache.match(request, opts)
    if (hit) return hit
  }
  return cache.match(url, opts)
}

async function precacheUrl(cache, url) {
  try {
    const res = await fetch(url, { cache: 'reload' })
    if (res.ok) {
      await cache.put(url, res.clone())
      return true
    }
  } catch {}
  try {
    await cache.add(url)
    return true
  } catch {}
  return false
}

async function cacheGrindAssets() {
  const cache = await caches.open(CACHE)
  for (const url of GRIND_ASSETS) {
    await precacheUrl(cache, url)
  }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await Promise.allSettled(PRECACHE.map(url => precacheUrl(cache, url)))
      return self.skipWaiting()
    })
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))
      ))
      .then(() => cacheGrindAssets())
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (e.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/question-images/') || url.pathname.startsWith('/description-images/')) {
    e.respondWith(
      caches.open(IMG_CACHE).then(async imgCache => {
        const opts = { ignoreSearch: true, ignoreVary: true }
        const cached =
          (await imgCache.match(e.request, opts)) ||
          (await imgCache.match(url.pathname, opts))
        if (cached) return cached
        try {
          const res = await fetch(e.request)
          if (res.ok) {
            await imgCache.put(url.pathname, res.clone())
            await imgCache.put(e.request, res.clone())
          }
          return res
        } catch {
          return new Response('', { status: 404 })
        }
      })
    )
    return
  }

  const isNextInternal = url.pathname.startsWith('/_next/')

  // Never cache Next.js dev/build assets in the SW.
  if (isNextInternal) {
    e.respondWith(fetch(e.request))
    return
  }

  if (url.pathname === GRIND_OFFLINE || url.pathname === GRIND_EDITOR) {
    e.respondWith(
      (async () => {
        const path = url.pathname
        const cached = await cacheGet(path, e.request)
        if (cached) return cached
        try {
          const res = await fetch(e.request)
          if (res.ok) {
            const cache = await caches.open(CACHE)
            await cache.put(path, res.clone())
            return res
          }
        } catch {}
        const retry = await cacheGet(path)
        if (retry) return retry
        if (path === GRIND_EDITOR) {
          return new Response('// editor not cached', { status: 503, headers: { 'Content-Type': 'application/javascript' } })
        }
        return new Response(
          '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:1.5rem"><h1>Grind not cached yet</h1><p>Open the app online once, wait for the download to finish, then try again.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
      })()
    )
    return
  }

  if (url.pathname === '/offline.html') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        })
        .catch(async () => {
          const cached = await cacheGet('/offline.html', e.request)
          return cached || offlineResponse()
        })
    )
    return
  }

  const isStatic =
    url.pathname.startsWith('/icons/')        ||
    url.pathname.endsWith('.json')            ||
    url.pathname.endsWith('.jpg')             ||
    url.pathname.endsWith('.png')             ||
    url.pathname.endsWith('.svg')             ||
    url.pathname.endsWith('.ico')             ||
    url.pathname.endsWith('.woff2')           ||
    url.pathname.endsWith('.woff')

  if (isStatic) {
    e.respondWith(
      (async () => {
        const cached = await cacheGet(url.pathname, e.request)
        if (cached) return cached
        try {
          const res = await fetch(e.request)
          if (res.ok) {
            const cache = await caches.open(CACHE)
            await cache.put(url.pathname, res.clone())
            return res
          }
        } catch {}
        const retry = await cacheGet(url.pathname)
        return retry || new Response('', { status: 503 })
      })()
    )
    return
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(async () => {
          const shell = offlineShellPath(url.pathname)
          if (shell) {
            const shellCached = await cacheGet(shell)
            if (shellCached) return shellCached
          }
          const cached = await caches.match(e.request)
          if (cached) return cached
          return offlineResponse()
        })
    )
    return
  }

  e.respondWith(
    fetch(e.request)
      .then(res => res)
      .catch(async () => {
        const cached = await caches.match(e.request)
        if (cached) return cached
        return new Response('', { status: 503 })
      })
  )
})

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('message', e => {
  if (e.data?.type === 'CACHE_GRIND_ASSETS') {
    e.waitUntil(cacheGrindAssets())
  }
})

self.addEventListener('message', e => {
  if (e.data?.type === 'CACHE_PAGES') {
    const pages = e.data.pages || []
    caches.open(CACHE).then(async cache => {
      for (const pageUrl of pages) {
        await precacheUrl(cache, pageUrl)
      }
    })
  }
})

self.addEventListener('message', e => {
  if (e.data?.type === 'CACHE_DESCRIPTION_IMAGES') {
    const paths = e.data.paths || []
    e.waitUntil(
      caches.open(IMG_CACHE).then(async imgCache => {
        const opts = { ignoreSearch: true, ignoreVary: true }
        let done = 0
        for (const path of paths) {
          try {
            const existing = (await imgCache.match(path, opts))
            if (!existing) {
              const res = await fetch(path)
              if (res.ok) {
                await imgCache.put(path, res.clone())
              }
            }
          } catch {}
          done++
          if (done % 15 === 0 || done === paths.length) {
            const clients = await self.clients.matchAll()
            clients.forEach(c =>
              c.postMessage({ type: 'DESC_IMG_PROGRESS', done, total: paths.length }),
            )
          }
        }
        const clients = await self.clients.matchAll()
        clients.forEach(c => c.postMessage({ type: 'DESC_IMG_DONE', total: paths.length }))
      }),
    )
  }
})

self.addEventListener('message', e => {
  if (e.data?.type === 'CACHE_ALL_IMAGES') {
    const ids = e.data.ids || []
    caches.open(IMG_CACHE).then(async imgCache => {
      let done = 0
      for (const id of ids) {
        const url = `/question-images/${id}.jpg`
        try {
          const existing = await imgCache.match(url)
          if (!existing) {
            const res = await fetch(url)
            if (res.ok) await imgCache.put(url, res)
          }
        } catch {}
        done++
        const clients = await self.clients.matchAll()
        clients.forEach(c => c.postMessage({ type: 'CACHE_PROGRESS', done, total: ids.length }))
      }
      const clients = await self.clients.matchAll()
      clients.forEach(c => c.postMessage({ type: 'CACHE_DONE' }))
    })
  }
})
