// 설치 가능한 PWA를 위한 최소 서비스 워커.
// 정적 에셋(폰트/CSS/아이콘)만 캐시하고, Firestore 등 나머지 요청은 항상 네트워크로 보낸다.
const CACHE_NAME = 'yeonsung-shell-v1';
const PRECACHE_URLS = [
  '/assets/theme.css',
  '/assets/ko-font.ttf',
  '/assets/favicon.png',
  '/assets/icon/pwa-192.png',
  '/assets/icon/pwa-512.png',
  '/assets/icon/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!PRECACHE_URLS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
