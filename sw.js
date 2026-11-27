// Service worker: keeps a copy of the app on the device so it opens with no connection.
// Plays themselves are not handled here; they live in the browser's own storage.

const CACHE = 'wrc-whiteboard-v1'
const scope = self.registration.scope

/** Store the page and every file it references, so the first online visit is enough. */
async function precache() {
  const cache = await caches.open(CACHE)
  const res = await fetch(scope, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not fetch app shell: ${res.status}`)
  const html = await res.clone().text()
  await cache.put(scope, res)
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => new URL(m[1], scope))
    .filter((u) => u.origin === self.location.origin)
    .map((u) => u.href)
  await cache.addAll(urls)
}

const store = async (key, res) => {
  if (res.ok) (await caches.open(CACHE)).put(key, res.clone())
  return res
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // Open from the saved copy straight away (arena wifi can hang rather than fail),
    // and fetch the latest in the background so an update shows on the next launch.
    const latest = fetch(scope, { cache: 'no-cache' }).then((res) => store(scope, res))
    event.waitUntil(latest.catch(() => {}))
    event.respondWith(caches.match(scope).then((hit) => hit ?? latest))
    return
  }

  event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => store(req, res))))
})
