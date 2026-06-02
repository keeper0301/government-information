// ============================================================
// korea.kr 상세 본문 전문 스크래핑 (RSS 요약 → 전문 보강)
// ============================================================
// 2026-06-02 — korea.kr collector 의 body 는 RSS <description>(요약, 중앙 140자,
// 80% 가 250 미만 thin). AdSense thin content 위험 + 사용자 가치 낮음.
//   → 상세 페이지(policyNewsView.do)의 article_body/view_cont 전문(정적 HTML)으로 교체.
// 강원/부산(hwp/PDF) 과 달리 본문이 정적 HTML 이라 정적 스크래핑으로 추출 가능.
//
// 신규 upsert 대상 payload 만 보강(부하 제한). 상세 실패/thin 시 RSS 요약 유지(안전).
// ============================================================

import { fetchWithTimeout } from "@/lib/collectors";

const UA = "Mozilla/5.0 keepioo-bot (+https://www.keepioo.com)";

// div depth 추적으로 컨테이너 본문 추출 (중첩 div 안전 — non-greedy 가 첫 </div> 에서
// 끊기는 문제 회피). 닫는 div 못 찾으면 null.
function extractDivByClass(html: string, cls: string): string | null {
  const open = new RegExp(
    `<div[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*>`,
    "i",
  ).exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  return null;
}

// 상세 본문 raw HTML → 평문. figure(이미지+캡션)·이미지 슬라이더·버튼 잡음 제거.
// (라이브 검증: "Previous Next" + 캡션 반복 슬라이더 제거 후 본문 본체만 남음)
export function cleanDetailBody(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(
      /<div[^>]*class="[^"]*(?:swiper|slick|slide|gallery|img_area|imgArea)[^"]*"[\s\S]*?<\/div>/gi,
      " ",
    )
    .replace(/<button[\s\S]*?<\/button>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\b(?:Previous|Next)\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// raw HTML(상세 페이지)에서 본문 전문 추출. article_body 우선, view_cont fallback.
// 한국어 포함 + 250자 이상이면 반환(cut 20000), 아니면 null(요약 유지).
export function parseDetailBodyHtml(html: string): string | null {
  const raw =
    extractDivByClass(html, "article_body") ??
    extractDivByClass(html, "view_cont");
  if (!raw) return null;
  const body = cleanDetailBody(raw);
  return /[가-힣]/.test(body) && body.length >= 250
    ? body.slice(0, 20000)
    : null;
}

// 상세 페이지 fetch → 본문 전문(≥250). 실패/thin 시 null(RSS 요약 유지).
async function fetchDetailBody(url: string): Promise<string | null> {
  try {
    // retries:0 — 실패/thin 은 RSS 요약 fallback 이라 재시도 무의미. 기본 retries=1 이면
    // korea.kr 일시 차단(429) 시 재시도가 차단을 가속(동시 다수 fetch) → 0 으로 폭주 차단.
    const res = await fetchWithTimeout(url, {
      timeoutMs: 15000,
      retries: 0,
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    return parseDetailBodyHtml(await res.text());
  } catch {
    return null;
  }
}

// payload(신규 upsert 대상) 본문을 상세 전문으로 보강. 병렬 제한 3
// (korea.kr 동시 부하 + 피드별 병렬과 곱해지는 점 고려). 실패/thin 은 요약 유지.
export async function enrichDetailBodies(
  payload: Array<{ source_url: string; body: string | null; summary: string | null }>,
): Promise<void> {
  const CONCURRENCY = 3;
  for (let i = 0; i < payload.length; i += CONCURRENCY) {
    const chunk = payload.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (p) => {
        const full = await fetchDetailBody(p.source_url);
        if (full) {
          p.body = full;
          p.summary = full.slice(0, 200);
        }
      }),
    );
  }
}
