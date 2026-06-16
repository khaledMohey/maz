const CACHE_NAME = 'mazr3a-pwa-v4'
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icons.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Cache API only supports http(s). Skip extensions, devtools, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.origin !== self.location.origin) return

  // SPA shell: only for real page navigations — never fall back to HTML for JS/CSS/modules
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (!response || response.status !== 200) return response
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone).catch(() => {})
        })
        return response
      } catch {
        const hit = await caches.match(request)
        if (hit) return hit
        return new Response('', { status: 503, statusText: 'Offline' })
      }
    }),
  )
})
