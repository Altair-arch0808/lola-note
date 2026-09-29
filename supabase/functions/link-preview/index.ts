// Edge Function: по ссылке на страницу возвращает главное фото (og:image) и заголовок.
// Деплой:  supabase functions deploy link-preview      (проверка входа — по умолчанию включена: работает только для вошедших)
// Ответ:   { image: "https://…" | "", title: "…" }   — при любой неудаче пустые строки, а не ошибка.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const EMPTY = { image: '', title: '' }

// Не ходим на локальные и внутренние адреса (базовая защита; сама функция работает в изолированном облаке Supabase)
function blocked(host: string) {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h.includes(':')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = +m[1], b = +m[2]
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  return false
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
}
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

function parse(html: string, base: string) {
  const metas: Record<string, string> = {}
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase()
    const val = attr(tag, 'content')
    if (key && val && !(key in metas)) metas[key] = unescape(val)
  }
  let image = metas['og:image:secure_url'] || metas['og:image'] || metas['twitter:image'] || metas['twitter:image:src'] || metas['image'] || ''
  if (!image) {
    const l = html.match(/<link\b[^>]*rel\s*=\s*["']?image_src["']?[^>]*>/i)
    if (l) image = unescape(attr(l[0], 'href'))
  }
  const title = metas['og:title'] || metas['twitter:title'] || unescape((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim())
  try { if (image) image = new URL(image, base).href.replace(/^http:\/\//i, 'https://') } catch { image = '' }
  return { image, title: title.slice(0, 200) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url } = await req.json()
    const u = new URL(String(url))
    if (!/^https?:$/.test(u.protocol) || blocked(u.hostname)) return json(EMPTY)

    const res = await fetch(u.href, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LolaNoteBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,image/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.8',
      },
    })
    const type = res.headers.get('content-type') || ''
    if (type.startsWith('image/')) { await res.body?.cancel(); return json({ image: u.href, title: '' }) }
    if (!res.ok || !/html|xml/i.test(type) || !res.body) { await res.body?.cancel(); return json(EMPTY) }

    // Метатеги лежат в <head>, поэтому читаем только начало страницы
    const reader = res.body.getReader(), dec = new TextDecoder()
    let html = ''
    while (html.length < 400_000) {
      const { done, value } = await reader.read()
      if (done) break
      html += dec.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    await reader.cancel()
    return json(parse(html, res.url || u.href))
  } catch {
    return json(EMPTY)
  }
})
