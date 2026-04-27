// ============================================================
// OpenGraph 이미지 추출 — 외부 URL → og:image meta 파싱
// ============================================================
// 네이버 검색 수집 뉴스(naver-news-*) 는 thumbnail_url 이 NULL.
// 기사 페이지 fetch → <meta property="og:image"> 추출해 thumbnail 채움.
// 빈 카드 fallback(아이콘) 대신 실제 기사 이미지 노출 → 시각·클릭률 ↑.
//
// 안전 원칙:
//   - timeout 5초 (운영 cron 5분 maxDuration 안전 마진)
//   - User-Agent 명시 (일부 사이트 봇 차단 회피)
//   - 응답 크기 제한 (최대 200KB — head 안에 og:image 있으면 충분)
//   - HTTPS URL 만 (HTTP 는 mixed content)
//   - protocol-relative URL(`//cdn...`) 은 https: 보강
//   - 빈 결과/에러 → null (호출자가 기존 동작 유지)
// ============================================================

const MAX_HTML_BYTES = 200_000; // 200KB — 대부분 사이트 head 가 50KB 미만
const FETCH_TIMEOUT_MS = 5000;

// User-Agent — 일반 브라우저 처럼 보이게 (네이버·언론사 봇 차단 회피)
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// HTML 에서 og:image 추출 — 두 속성 순서 모두 커버 (property/content 가변).
// twitter:image 도 fallback 으로 시도.
export function extractOgImage(html: string): string | null {
  // <meta property="og:image" content="..."> 또는
  // <meta content="..." property="og:image">
  const ogPatterns = [
    /<meta\s+property=["']og:image(?::secure_url|:url)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url|:url)?["']/i,
    /<meta\s+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
  ];
  for (const re of ogPatterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const raw = m[1].trim();
      // protocol-relative URL → https: 보강 (대부분 한국 언론사 cdn 패턴)
      if (raw.startsWith("//")) return `https:${raw}`;
      // http: 는 mixed content 문제로 거부 (사용자 카드에 안 노출되는 위험 회피)
      if (raw.startsWith("https://")) return raw;
      // 상대 URL 또는 http: → null
      return null;
    }
  }
  return null;
}

// 외부 URL → og:image URL.
// 실패(timeout·404·파싱 실패) → null. 절대 throw 하지 않음 (cron 안정성).
export async function fetchOgImage(url: string): Promise<string | null> {
  if (!url || !url.startsWith("https://")) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;

    // 응답 크기 제한 — head 만 읽고 끊기 위해 reader 사용
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return extractOgImage(text.slice(0, MAX_HTML_BYTES));
    }

    let received = 0;
    const chunks: Uint8Array[] = [];
    const decoder = new TextDecoder("utf-8", { fatal: false });
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
    // 더 안 읽음 — 연결 종료
    try {
      await reader.cancel();
    } catch {
      // 이미 닫힌 상태 — 무시
    }

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c.subarray(0, Math.min(c.byteLength, received - offset)), offset);
      offset += c.byteLength;
      if (offset >= received) break;
    }
    const html = decoder.decode(merged);
    return extractOgImage(html);
  } catch {
    // 네트워크 오류·timeout·abort 모두 null 반환 (호출자가 안전하게 무시)
    return null;
  } finally {
    clearTimeout(timer);
  }
}
