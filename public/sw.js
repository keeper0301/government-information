// keepioo PWA service worker — offline 캐싱 + push 이벤트 listener.
//
// 캐싱 전략:
//  · install 시 / 와 /offline 두 페이지를 미리 캐시 (precache)
//  · stale-while-revalidate — 캐시 응답을 우선 반환 + 백그라운드 갱신
//  · GET 요청 + 동일 origin 만 캐시 (보안·안정성)
//  · /api/* 와 /_next/data/* 는 캐시 미적용 (실시간 데이터 stale 위험)
//
// push 이벤트:
//  · 1단계 — listener 만 등록. 실제 발송은 사용자 동의 + VAPID 셋업 후 phase
//
// 버전 관리:
//  · CACHE_NAME 의 v1 을 올리면 activate 단계에서 옛 캐시 자동 삭제

const CACHE_NAME = "keepioo-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = ["/", "/offline"];

// install — 핵심 페이지를 미리 캐시. 실패해도 활성화는 진행 (catch).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        // precache 실패는 무시 — 첫 실행 시 네트워크 이슈일 수 있음
      }),
  );
  // 새 sw 가 즉시 활성화되도록 대기 단계 skip
  self.skipWaiting();
});

// activate — 옛 버전 캐시 정리 + 즉시 클라이언트 제어권 획득
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// fetch — stale-while-revalidate 패턴
//  1) 캐시에 있으면 즉시 반환
//  2) 동시에 네트워크에서 새 응답을 받아 캐시 갱신
//  3) 네트워크 실패 시 캐시 또는 /offline fallback
self.addEventListener("fetch", (event) => {
  // GET 만 캐시 (POST/PUT 은 캐시 자체가 의미 없음)
  if (event.request.method !== "GET") return;

  // 같은 origin 만 (외부 광고·CDN 등은 브라우저 기본 처리)
  if (!event.request.url.startsWith(self.location.origin)) return;

  // API/RSC 데이터는 캐시 제외 — stale 데이터 위험
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then((res) => {
          // 정상 응답 (200, basic = 같은 origin 일반 응답) 만 캐시 저장
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => {
          // 네트워크 실패 → 캐시 → 그래도 없으면 offline 페이지
          return cached || caches.match(OFFLINE_URL);
        });
      return cached || fresh;
    }),
  );
});

// push — 서버에서 푸시 발송 시 호출 (사용자 동의 + VAPID 키 셋업 필요)
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {
    title: "keepioo",
    body: "새 정책 알림",
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
    }),
  );
});

// notificationclick — 알림 클릭 시 keepioo 탭이 열려있으면 focus,
// 없으면 새 창으로 홈 오픈
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (
          client.url.startsWith(self.location.origin) &&
          "focus" in client
        ) {
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    }),
  );
});
