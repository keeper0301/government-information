// ============================================================
// 연수구청 보도자료 수집 (2026-05-22)
// ============================================================
// 인천광역시 연수구 인구 39만. ASP system (report.asp?seq=N), 29,084+ 보도자료.
//
// URL:
//   list:   /main/community/notify/report.asp
//   상세:   /main/community/notify/report.asp?page=v&seq=N
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yeonsu.go.kr";
const LIST_URL =
  "https://www.yeonsu.go.kr/main/community/notify/report.asp";

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*report\.asp\?[^"]*seq=(\d+)[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:board_view|hwp_editor_board_content)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach)|<\/article|<\/section)/i;

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
      sourceUrl: `${BASE_URL}/main/community/notify/report.asp?page=v&seq=${seq}`,
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

export const { scrapeAndInsert: scrapeYeonsuAndInsert } = createPressCollector({
  cityName: "연수구",
  region: "인천",
  ministry: "연수구청",
  sourceOutlet: "연수구청",
  sourceCode: "local-press-yeonsu",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
