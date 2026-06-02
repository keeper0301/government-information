// ============================================================
// 하남시청 보도자료 수집 (2026-05-22)
// ============================================================
// 하남시 인구 32만. SI 표준 selectBbsNttList.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.hanam.go.kr";
const LIST_URL =
  "https://www.hanam.go.kr/sosik/selectBbsNttList.do?bbsNo=1164&key=10048";

// 2026-05-26 inner limit {0,500} → {0,5000} (a 안 nested 큰 thumb 가 첫 match 막음)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=1164)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,5000}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:bbs_wrap|p-table__content|bbs__view)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:p-table__bottom|btn|pagination)|<\/article|<\/section)/i;

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
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/sosik/selectBbsNttView.do?bbsNo=1164&nttNo=${seq}&key=10048`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  // 2026-06-02 fix — 본문 컨테이너 안 <script>(fn_deleteBbsNtt 등) 블록 제거.
  // 구 코드는 <script> 태그만 지우고 JS 코드 텍스트가 본문 머리에 섞이던 버그.
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

export const { scrapeAndInsert: scrapeHanamAndInsert } = createPressCollector({
  cityName: "하남시",
  region: "경기",
  ministry: "하남시청",
  sourceOutlet: "하남시청",
  sourceCode: "local-press-hanam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
