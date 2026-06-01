// ============================================================
// 강서구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 56만. eDotXpress CMS (UTF-8, 정적 HTML). 도메인 www.gangseo.seoul.kr.
// 메뉴 "보도자료" = /gs040201 (목록). 글 상세 = /gs040201/{글ID}.
//
// list: <table> 안 <a href="/gs040201/{id}?srch...">제목</a> + 부서 td + 작성일 td.
//   (제목은 헤드라인 + "..." 부제 한 줄 — 전체가 실제 제목).
// 본문: <div class="view-content"> 셀 (div 중첩 깊이 추적).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gangseo.seoul.kr";
const LIST_URL = `${BASE_URL}/gs040201`;

// list anchor: /gs040201/{id}?... (쿼리 필수 — 본문 anchor 와 메뉴/페이지 anchor 구분)
const LIST_ITEM_REGEX =
  /<a[^>]*href="\/gs040201\/(\d+)\?[^"]*"[^>]*>([\s\S]{0,400}?)<\/a>/g;

// 같은 row 작성일 td: YYYY-MM-DD
const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // anchor 뒤 부서 td → 작성일 td. 600자 buffer 안 첫 YYYY-MM-DD.
    const slice = html.slice(m.index, m.index + 600);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/gs040201/${seq}`,
    });
  }
  return items;
}

// 본문 컨테이너 <div class="view-content"> — div 중첩 깊이 추적으로 매칭 </div> 탐색.
const VIEW_OPEN_REGEX = /<div[^>]*\bclass="view-content"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = VIEW_OPEN_REGEX.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, m.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null; // 닫는 </div> 없음(응답 잘림) → junk 방지

  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  // 2026-06-01 리뷰 — 본문 min 50 → 250 (AGENTS.md 룰·thin content/AdSense 방지 통일).
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGangseoAndInsert } = createPressCollector({
  cityName: "강서구",
  region: "서울",
  ministry: "강서구청",
  sourceOutlet: "강서구청",
  sourceCode: "local-press-gangseo",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
