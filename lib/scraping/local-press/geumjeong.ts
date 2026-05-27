// ============================================================
// 금정구청 보도자료 수집 (2026-05-27) — 부산 자치구 batch
// ============================================================
// 금정구 인구 22만. SI 표준 (`/board/list.geumj?boardId=BBS_0000004`).
// 부산진 (busanjin.ts) 동일 SI CMS — list/view URL 패턴 일관.
// detail body class="contents" (busanjin 의 view_cont 와 다름, 정규식 확장).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.geumjeong.go.kr";
const LIST_URL =
  "https://www.geumjeong.go.kr/board/list.geumj?boardId=BBS_0000004";

const LIST_ITEM_REGEX =
  /<a[^>]*href="(\/board\/view\.geumj\?[^"]*boardId=BBS_0000004[^"]*dataSid=(\d+)[^"]*)"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2}|\d{2}\.\d{2}\.\d{2})/g;

// 금정 body: class="contents" + busanjin 패턴 fallback (호환성)
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:contents|view_cont|board_view|bbs_view|cont_box|view_content|board_view_body)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|view_list)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    let publishedDate: string | null = null;
    if (dateMatch) {
      const raw = dateMatch[1].replace(/\./g, "-");
      publishedDate = /^\d{2}-/.test(raw) ? `20${raw}` : raw;
    }
    // href 안의 HTML entity `&amp;` decode
    const path = m[1].replace(/&amp;/g, "&");
    const fullUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: fullUrl,
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

export const { scrapeAndInsert: scrapeGeumjeongAndInsert } = createPressCollector(
  {
    cityName: "금정구",
    region: "부산",
    ministry: "금정구청",
    sourceOutlet: "금정구청",
    sourceCode: "local-press-geumjeong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
