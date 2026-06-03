// ============================================================
// 여수시청 보도자료 수집 (2026-05-22) — 사장님 거주지 인접 (전남)
// ============================================================
// 여수시 인구 27만. 30,327+ 보도자료 (매우 풍부). 자체 CMS.
//
// URL:
//   list:   /www/govt/news/release
//   상세:   /www/govt/news/release/view?idx=N (또는 동일 path with idx)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://yeosu.go.kr";
const LIST_URL = "https://yeosu.go.kr/www/govt/news/release";

// 여수 detail href 패턴 — idx 만 알고 path 가변. release 또는 view 키워드 포함.
const LIST_ITEM_REGEX =
  /<a[^>]*href="([^"]*(?:release|view|read)[^"]*idx=(\d+)[^"]*)"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

// 여수 body — module_view_box 또는 contbox
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:module_view_box|contbox|view_cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|module_btn|file|attach)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    // 2026-06-03 — "새로운글" 배지 cut. 기존 `새로운글$` 는 \s+→" " 후 끝 공백이
    // 남아 $ 미매칭(trim 이 cut 뒤라 무효)이었음 → 앞뒤 공백 허용으로 실제 제거.
    const title = decodeBasicEntities(
      m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).replace(/\s*새로운글\s*$/, "").trim();
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
      sourceUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeYeosuAndInsert } = createPressCollector({
  cityName: "여수시",
  region: "전남",
  ministry: "여수시청",
  sourceOutlet: "여수시청",
  sourceCode: "local-press-yeosu",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
