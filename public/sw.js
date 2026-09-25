// 설치 가능한 PWA를 위한 최소 서비스 워커.
// 정적 에셋(폰트/CSS/아이콘)만 캐시하고, 페이지(HTML)는 항상 서버에 확인해서 받는다.
// /api 등 나머지 요청은 서비스 워커가 손대지 않는다.
const CACHE_NAME = 'yeonsung-shell-v2';
// 네트워크가 끊겼을 때 대신 내줄 페이지 보관함 (마지막으로 성공한 응답)
const PAGE_CACHE = 'yeonsung-pages-v1';
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
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== PAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 페이지(HTML) 요청은 브라우저 캐시를 건너뛰고 항상 서버에 확인한 뒤 받는다.
  //
  // 2026.09.26: nginx가 Cache-Control을 안 보내던 시절에 저장된 페이지들이 휴리스틱 캐싱으로
  // 며칠씩 "신선한" 것으로 취급돼, 배포를 해도 사람마다 옛 화면이 보이는 문제가 있었다.
  // nginx 쪽은 no-cache로 고쳤지만 그건 앞으로 받는 응답에만 적용돼서, 이미 캐시에 들어앉은
  // 페이지들은 URL마다 따로 남아 있다(글 83개면 항목도 83개). 여기서 강제로 재검증하면
  // 사용자가 캐시를 지우지 않아도 다음 이동부터 최신 페이지를 받는다.
  //
  // 받아온 페이지는 따로 보관해뒀다가 네트워크가 죽었을 때 대신 내준다. 서버 헤더가
  // no-cache라 브라우저 캐시만으로는 오프라인에서 페이지가 아예 안 열리기 때문이다.
  // navigate 모드 Request는 그대로 재구성할 수 없어서 URL로 새로 요청한다.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.put(url.href, copy)));
          }
          return response;
        })
        .catch(() => caches.match(url.href).then((cached) => cached || fetch(event.request)))
    );
    return;
  }

  if (!PRECACHE_URLS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
