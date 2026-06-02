// ============================================================
// 안양시청 보도자료 수집 (2026-05-22) — 광역도 시·군 확장
// ============================================================
// 안양시 인구 55만. SI 표준 specialized endpoint (selectPressReleaseList.do).
// 3,266+ 보도자료.
//
// URL:
//   list:   /main/selectPressReleaseList.do?bbsNo=1687&key=4107
//   상세:   /main/selectPressRelease.do?key=4107&nttNo=N&bbsNo=1687
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://anyang.go.kr";
const LIST_URL =
  "https://anyang.go.kr/main/selectPressReleaseList.do?bbsNo=1687&key=4107";

const LIST_ITEM_REGEX =
  /<td\s+class="p-subject"><a\s+href="\.\/selectPressRelease\.do\?key=4107&(?:amp;)?nttNo=(\d+)[^"]*">([^<]+)<\/a><\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="view_cont[^"]*"[^>]*>([\s\S]{50,30000}?)(?:<div\s+class="(?:btn|p-table__bottom|btn_area)|<\/article)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    items.push({
      seq,
      title,
      publishedDate: m[3],
      sourceUrl: `${BASE_URL}/main/selectPressRelease.do?key=4107&nttNo=${seq}&bbsNo=1687`,
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

export const { scrapeAndInsert: scrapeAnyangAndInsert } = createPressCollector({
  cityName: "안양시",
  region: "경기",
  ministry: "안양시청",
  sourceOutlet: "안양시청",
  sourceCode: "local-press-anyang",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
