// ============================================================
// 목포시청 보도자료 수집 (2026-05-22) — 전남 batch
// ============================================================
// 목포시 인구 21만. 자체 CMS (여수와 유사 idx=N&mode=view).
// 10,764+ 보도자료. 사장님 거주지 (전남) 인접.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.mokpo.go.kr";
const LIST_URL =
  "https://www.mokpo.go.kr/www/mokpo_news/press_release";

// detail URL: /www/mokpo_news/press_release/report_material?idx=N&mode=view
// regex 완화 2건:
// (1) 2026-05-24: mode=view 조건 제거 (파라미터 순서 hard-fix 방지)
// (2) 2026-05-26: inner limit {0,500} → {0,5000}. a 안 img thumb_box + cont_box title meta 가
//     785자 → 500 으로 매칭 0 silent fail. 5/22 batch 추가 site 첫 cron 부터 누락.
const LIST_ITEM_REGEX =
  /<a[^>]*href="([^"]*press_release\/report_material\?[^"]*idx=(\d+)[^"]*)"[^>]*>([\s\S]{0,5000}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|cont_box|contents)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    // 2026-06-03 fix — anchor inner 통째(썸네일·새로운글 배지·p 본문)를 제목으로 잡던 버그.
    // 제목은 div.title_box > h3 만. 배지 span.icon_new 를 먼저 제거(제목 본문에 "새로운글"
    // 글자가 있어도 안전 — 텍스트 strip 대신 배지 요소만 제거).
    const tm = /<div\s+class="title_box"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(m[3]);
    const title = decodeBasicEntities(
      (tm ? tm[1] : m[3])
        .replace(/<span[^>]*icon_new[^>]*>[\s\S]*?<\/span>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    const detailPath = m[1].startsWith("http") ? m[1] : `${BASE_URL}${m[1]}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: detailPath,
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

export const { scrapeAndInsert: scrapeMokpoAndInsert } = createPressCollector({
  cityName: "목포시",
  region: "전남",
  ministry: "목포시청",
  sourceOutlet: "목포시청",
  sourceCode: "local-press-mokpo",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
