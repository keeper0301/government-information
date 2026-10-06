// 고정 파일만 저장합니다. 정책·계정 화면은 서버의 최신 응답을 사용합니다.
const CACHE_NAME = "keepioo-v2-static";
const OFFLINE_URL = "/offline";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("keepioo-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return;
  // 화면 내용은 저장하지 않습니다. 통신 실패 때만 저장된 안내로 돌아갑니다.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL).catch(() => undefined);
      if (offline) return offline;
      return new Response("인터넷 연결을 확인한 뒤 다시 시도해 주세요.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }));
    return;
  }
  if (!url.pathname.startsWith("/_next/static/") && url.pathname !== OFFLINE_URL) return;
  // 저장 기능을 사용할 수 없는 브라우저에서도 통신으로 정상 파일을 전달합니다.
  event.respondWith(caches.open(CACHE_NAME).catch(() => undefined).then(async cache => {
    const cached = cache ? await cache.match(request).catch(() => undefined) : undefined;
    if (cached) return cached;
    const response = await fetch(request);
    const policy = response.headers.get("Cache-Control") ?? "";
    if (cache && response.status === 200 && response.type === "basic" && !/private|no-store/i.test(policy)) {
      // 저장 공간이 부족해도 이미 받은 정상 파일은 화면에 전달합니다.
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }));
});

// push — 서버에서 푸시 발송 시 호출 (사용자 동의 + VAPID 키 셋업 필요)
// 2026-05-19 — payload 확장: url + tag + icon + badge 지원
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {
    title: "keepioo",
    body: "새 정책 알림",
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || "",
      icon: data.icon || "/icon.svg",
      badge: data.badge || "/icon.svg",
      tag: data.tag || "keepioo-notification",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

// notificationclick — 알림 클릭 시 keepioo 탭이 열려있으면 focus + navigate,
// 없으면 새 창으로 payload.url (default /) 오픈.
// 2026-05-19 review fix — same-origin 가드. server bug 로 외부 origin 발송 시
// keepioo 탭이 외부로 navigate 되는 사고 차단. attacker.com URL fallback "/".
// 2026-05-27 Spec 3 — logId 있으면 track-click endpoint POST (시점 학습 데이터).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/";
  const logId = event.notification.data?.logId;
  const token = event.notification.data?.token;
  let targetUrl = "/";
  try {
    const resolved = new URL(rawUrl, self.location.origin);
    if (resolved.origin === self.location.origin) {
      targetUrl = resolved.pathname + resolved.search + resolved.hash;
    }
  } catch {
    // 잘못된 URL → "/" fallback
  }
  // 클릭 추적 — 실패해도 navigate 진행 (사용자 경험 우선)
  // 2026-05-27 P1-1: token 동봉 — endpoint 가 HMAC verify (brute-force 차단)
  const trackPromise = logId && token
    ? fetch("/api/push/track-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, token }),
        keepalive: true,
      }).catch(() => {})
    : Promise.resolve();
  event.waitUntil(
    Promise.all([
      trackPromise,
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if (
            client.url.startsWith(self.location.origin) &&
            "focus" in client
          ) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
    ]),
  );
});
