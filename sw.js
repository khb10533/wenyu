/* 文游工坊 Service Worker —— 首次加载后整站离线可用 */
const CACHE = 'wenyu-v14';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fallback.css',
  './app.css',
  './player.css',
  './format.js',
  './store.js',
  './stage.js',
  './player.js',
  './io.js',
  './editor.js',
  './main.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sw] precache partial:', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管同源资源，避免干扰其它站点
  if (url.origin !== self.location.origin) return;

  // 下载类请求一律不碰 —— 被缓存拦住的话，会反复下到旧版本的包
  if (/\/(get|download|download-source)$/.test(url.pathname) || /\.zip$/i.test(url.pathname)) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        fetch(req)
          .then((resp) => {
            if (resp && resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
          })
          .catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((resp) => {
          if (resp && resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
