// ============================================================
// IndexNow 자동 색인 — 네이버·Bing·Yandex 동시 ping
// ============================================================
// IndexNow 표준 (https://www.indexnow.org/) 으로 발행/갱신/삭제 페이지를
// 검색엔진에 즉시 알림. 검색봇이 사이트 방문할 때까지 기다리지 않고 push.
//
// 네이버 공식 지원 (https://searchadvisor.naver.com/guide/indexnow-about):
//   POST https://searchadvisor.naver.com/indexnow
//   요청 본문에 host·key·urlList. 한 번에 최대 10,000 URL.
//
// 인증:
//   - INDEXNOW_KEY 환경변수 = 32~128자 hex 문자열 (예: crypto.randomBytes(32))
//   - 검색엔진이 https://www.keepioo.com/{key}.txt 를 GET 해 key 응답 확인
//     → 사이트 소유자 검증
//   - 우리는 keyLocation 으로 /api/indexnow-key 명시 (Next.js dynamic [key].txt
//     라우팅보다 단순)
//
// 안정성:
//   - 환경변수 미설정 시 skip (정상 동작 유지, dev 환경 안전)
//   - HTTP 실패해도 throw 안 함 — publish-blog 같은 호출자가 안전 무시 가능
//   - timeout 5초 (cron maxDuration 60초 안전 마진)
// ============================================================

const INDEXNOW_TIMEOUT_MS = 5000;

export type IndexNowResult =
  | { ok: true; submitted: number; provider: "naver" | "bing" | "indexnow.org" }
  | { ok: false; reason: "skipped_no_key" }
  | { ok: false; reason: "http_error"; status: number; error: string }
  | { ok: false; reason: "network_error"; error: string };

// IndexNow ping — 네이버 직접 + IndexNow.org 통합 (Bing/Yandex 자동 분배).
// urls: 절대 URL list (https://www.keepioo.com/blog/...). 최대 10,000.
// 반환: 각 provider 별 결과 array. 일부 실패해도 다른 provider 시도 진행.
export async function submitToIndexNow(
  urls: string[],
): Promise<IndexNowResult[]> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return [{ ok: false, reason: "skipped_no_key" }];
  }

  if (urls.length === 0) {
    return [{ ok: true, submitted: 0, provider: "naver" }];
  }

  // host 추출 — 첫 URL 의 hostname (모든 URL 이 같은 host 라고 가정)
  let host: string;
  try {
    host = new URL(urls[0]).hostname;
  } catch {
    return [
      { ok: false, reason: "network_error", error: "invalid URL in list" },
    ];
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
  const keyLocation = `${baseUrl}/api/indexnow-key`;

  const payload = {
    host,
    key,
    keyLocation,
    urlList: urls.slice(0, 10_000), // IndexNow 한도 10,000
  };

  // 네이버 + indexnow.org 동시 ping (Promise.allSettled — 일부 실패해도 진행)
  // indexnow.org 는 Bing/Yandex 등에 자동 분배.
  const targets = [
    { url: "https://searchadvisor.naver.com/indexnow", provider: "naver" as const },
    { url: "https://api.indexnow.org/indexnow", provider: "indexnow.org" as const },
  ];

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), INDEXNOW_TIMEOUT_MS);
      try {
        const res = await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Host: target.url.includes("naver.com")
              ? "searchadvisor.naver.com"
              : "api.indexnow.org",
          },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        // 200/202 모두 성공 (IndexNow 표준)
        if (res.status === 200 || res.status === 202) {
          return {
            ok: true as const,
            submitted: payload.urlList.length,
            provider: target.provider,
          };
        }
        const errText = await res.text().catch(() => "");
        return {
          ok: false as const,
          reason: "http_error" as const,
          status: res.status,
          error: errText.slice(0, 200),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          ok: false as const,
          reason: "network_error" as const,
          error: msg,
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return results.map((r) => {
    if (r.status === "fulfilled") return r.value;
    return {
      ok: false as const,
      reason: "network_error" as const,
      error: String(r.reason),
    };
  });
}
