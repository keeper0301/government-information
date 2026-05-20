// ============================================================
// 전북특별자치도 도청 보도자료 수집 (Phase 1 — 광역도 3번째)
// ============================================================
// 인구 175만. CMS: 전북자치도 newsroom 자체.
//   - list: <a href="/board/view.jeonbuk?dataSid=N"> 내부에 <strong>제목</strong>
//   - 작성일: "작성일 : YYYY-MM-DD" 패턴
//   - 본문 컨테이너: <div class="bbs_view">
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jeonbuk.go.kr";
const LIST_URL =
  "https://www.jeonbuk.go.kr/newsroom/board/list.jeonbuk?boardId=BBS_0000090&menuCd=DOM_000001101000000000";

// link + 같은 a tag 안 strong 제목 매칭 (multiline)
const LIST_ITEM_REGEX =
  /<a\s+href="\/board\/view\.jeonbuk[^"]*?dataSid=(\d+)[^"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/g;

// list 안 "작성일 : YYYY-MM-DD" 패턴
const DATE_REGEX = /작성일\s*:\s*(\d{4}-\d{2}-\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="bbs_view"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<\/section|<\/article)/i;

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
    if (!title || title.length < 5) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    items.push({
      seq,
      title,
      publishedDate: dateMatch ? dateMatch[1] : null,
      sourceUrl: `${BASE_URL}/board/view.jeonbuk?boardId=BBS_0000090&menuCd=DOM_000001101000000000&dataSid=${seq}`,
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
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeJeonbukAndInsert } = createPressCollector({
  cityName: "전북특별자치도",
  region: "전북",
  ministry: "전북특별자치도청",
  sourceOutlet: "전북특별자치도청",
  sourceCode: "local-press-jeonbuk",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
