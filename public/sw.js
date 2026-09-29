/* Сервис-воркер: приложение открывается без интернета.
   • Оболочка (index.html) и файлы из /assets — кэшируются при первом заходе.
   • Страница: сначала сеть, но если связь плохая и ответа нет 3 секунды — отдаём сохранённую копию.
   • Запросы к Supabase сюда не попадают: данные и очередь записей — на стороне приложения (store.js). */
const VER = 'planner-v1'

async function precache() {
  const cache = await caches.open(VER)
  const res = await fetch('/', { cache: 'reload' })
  await cache.put('/', res.clone())
  const html = await res.text()
  const found = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|png|svg|webmanifest))"/g)].map(m => m[1])
  const urls = [...new Set([...found, '/icon-192.png', '/icon-512.png'])]
  await Promise.all(urls.map(u => cache.add(u).catch(() => {})))
}

self.addEventListener('install', e => { e.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

async function page(e) {
  const cache = await caches.open(VER)
  const cached = await cache.match('/')
  const net = fetch(e.request).then(r => { if (r.ok) cache.put('/', r.clone()); return r }).catch(() => null)
  e.waitUntil(net)
  if (!cached) return (await net) || Response.error()
  const fast = await Promise.race([net, new Promise(r => setTimeout(() => r(null), 3000))])
  return fast || cached
}

async function cacheFirst(req) {
  const cache = await caches.open(VER)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

async function fonts(req) {
  const cache = await caches.open(VER)
  const hit = await cache.match(req)
  const net = fetch(req).then(r => { cache.put(req, r.clone()); return r }).catch(() => null)
  return hit || (await net) || Response.error()
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (req.mode === 'navigate') { e.respondWith(page(e)); return }
  if (url.origin === self.location.origin && url.pathname !== '/sw.js') { e.respondWith(cacheFirst(req)); return }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(fonts(req)); return }
})
