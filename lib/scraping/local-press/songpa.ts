// ============================================================
// 송파구청 보도자료 수집 (2026-05-22) — 자치구 확장 3번째
// ============================================================
// 인구 67만 (서울 자치구 1위). 처음엔 SPA 의심했으나, 사장님 chrome 검증 시 redirect:
//   /www/sub.do?key=2781 → /www/selectBbsNttList.do?bbsNo=96&key=2781
// = SI 표준 (chungbuk·노원 동일). 8,077+ 보도자료.
//
// URL:
//   list:   selectBbsNttList.do?bbsNo=96&key=2781
//   상세:   selectBbsNttView.do?bbsNo=96&nttNo=N&key=2781
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.songpa.go.kr";
const LIST_URL =
  "https://www.songpa.go.kr/www/selectBbsNttList.do?bbsNo=96&key=2781";

// SI 표준 — query 순서 무관 lookahead 매칭 (gyeongbuk 패턴)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=96)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

// 송파 site 표준: p-table__content 또는 bbs__view 또는 content-information
const BODY_CONTAINER_REGEX =
  /<(?:div|td)\s+class="(?:p-table__content|bbs__view|content-information|p-wrap[^"]*bbs[^"]*view)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:p-table__bottom|btn|pagination)|<\/article|<\/section)/i;

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
    // 각 link +800 char slice 안에서 date
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=96&nttNo=${seq}&key=2781`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  // 2026-06-03 fix — 본문 컨테이너 안 <script>(fn_update 등) 블록 제거 (JS 코드 본문 혼입 버그).
  const text = decodeBasicEntities(
    m[1]
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeSongpaAndInsert } = createPressCollector({
  cityName: "송파구",
  region: "서울",
  ministry: "송파구청",
  sourceOutlet: "송파구청",
  sourceCode: "local-press-songpa",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
