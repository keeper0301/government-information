// ============================================================
// 충청남도 도청 보도자료 수집 (Phase 1 — 광역도 6번째)
// ============================================================
// 인구 213만. CMS: cnportal 자체 (cnapcPress board).
//   - list link: <a href="/cnportal/cnapcPressList/cnapcPress/view.do?nttId=N..." class="tit">제목</a>
//   - 본문: detail page 컨테이너
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chungnam.go.kr";
const LIST_URL =
  "https://www.chungnam.go.kr/cnportal/cnapcPressList/cnapcPress/list.do?menuNo=500498";

const LIST_ITEM_REGEX =
  /<a\s+href="\/cnportal\/cnapcPressList\/cnapcPress\/view\.do\?nttId=(\d+)[^"]*"\s+class="tit">([^<]+)<\/a>/g;

const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

// 2026-05-22 fix — site 가 board-view + content_body 새 class 사용.
// 기존 bbs_view 등 매칭 0. 새 class + legacy fallback.
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:board-view|content_body|content_ar)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="board-view-li\s+item|<\/article|<\/section)/i;
const BODY_CONTAINER_REGEX_LEGACY =
  /<(?:div|td)\s+(?:class|id)="(?:bbs_view|content|board_view|view_content|tbl_view)"[^>]*>([\s\S]*?)<\/(?:div|td)>/i;

export function parseListPage(html: string): PressNewsItem[] {
  // 2026-05-20 subagent review hot-fix — 각 link 매치 위치 +800 char slice 안에서만
  // date 추출. 옛 코드의 dates[] 전체 array 매칭은 footer/script date 까지 잡혀
  // items[i] ↔ dates[i] 어긋날 위험.
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
    const publishedDate = dateMatch ? dateMatch[1] : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/cnportal/cnapcPressList/cnapcPress/view.do?nttId=${seq}&menuNo=500498`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html) ?? BODY_CONTAINER_REGEX_LEGACY.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeChungnamAndInsert } = createPressCollector({
  cityName: "충청남도",
  region: "충남",
  ministry: "충청남도청",
  sourceOutlet: "충청남도청",
  sourceCode: "local-press-chungnam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
