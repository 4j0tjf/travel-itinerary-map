// 여정 오프라인 지원. 연결이 끊겨도 앱 화면과 마지막으로 불러온 여행 일정을 열 수 있게 한다.
// - Google 지도 이미지와 외부 요청은 저장하지 않는다(약관상 저장 불가).
// - 저장하는 API는 로그인 상태와 여행 목록뿐이다. 로그아웃하면 앱이 trip-data를 지운다.
const SHELL = "shell-v1";
const DATA = "trip-data";
const scope = new URL(self.registration.scope).pathname;
const api = scope + "api/";
const OFFLINE_API = new Set([api + "auth/me", api + "trips"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.add(new Request(scope, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("shell-") && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, key = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(key);
    if (saved) return saved;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(api)) {
    if (OFFLINE_API.has(url.pathname)) event.respondWith(networkFirst(request, DATA));
    return;
  }
  // 화면 주소는 모두 같은 index.html이다(해시 라우팅).
  if (request.mode === "navigate") event.respondWith(networkFirst(request, SHELL, scope));
  else if (url.pathname.startsWith(scope + "assets/")) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request, SHELL));
});
