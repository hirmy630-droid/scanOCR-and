// GoodScan AI: scoped update, unchanged application HTML.
const APP_SCOPE = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', APP_SCOPE).href;
const MANIFEST_URL = new URL('manifest.json', APP_SCOPE).href;
const CACHE_PREFIX = 'goodscan:' + encodeURIComponent(APP_SCOPE.pathname) + ':';
const CACHE_NAME = CACHE_PREFIX + '20261013-0720-v15';
// Only the exact legacy cache supplied with this application is migrated.
const LEGACY_CACHE_NAMES = ['goodscan-cache-v2'];

function isIndex(url) {
  return url.origin === APP_SCOPE.origin &&
    (url.pathname === APP_SCOPE.pathname || url.pathname === new URL(INDEX_URL).pathname);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) {
      throw new Error('Latest index.html could not be fetched; keeping existing worker.');
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(INDEX_URL, response);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME &&
      (name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_NAMES.includes(name)))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function latestOrOffline(request, cacheKey) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    // Preserve the previous successful offline copy on HTTP errors.
    const contentType = response.headers.get('content-type') || '';
    const expectedType = cacheKey === INDEX_URL ? /text\/html/i : /json/i;
    if (response.ok && expectedType.test(contentType)) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheKey, response.clone());
      } catch (_) { /* Cache failure must not block online use. */ }
    }
    return response;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match(cacheKey);
    if (offline) return offline;
    return new Response(cacheKey === INDEX_URL ?
      'オフラインです。インターネット接続後にアプリを開いてください。' :
      'Offline: manifest unavailable', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== APP_SCOPE.origin) return;
  if (isIndex(url)) {
    event.respondWith(latestOrOffline(request, INDEX_URL));
  } else if (url.pathname === new URL(MANIFEST_URL).pathname) {
    event.respondWith(latestOrOffline(request, MANIFEST_URL));
  }
  // Other HTML, repositories, assets and Gemini API requests are untouched.
});
