// ============================================================
// 평택시 보도자료 수집 — G4 Phase B (helper 활용, SI 표준 SPA GET 우회)
// ============================================================
// URL:
//   list:   /pyeongtaek/board/post/list.do?bcIdx=90
//   상세:   /pyeongtaek/board/post/view.do?bcIdx=90&mid=0402010000&idx={NNN}
// SPA 표면적 yhLib.inline.post 함수 호출이지만, view.do 가 GET 도 받아서
// 직접 URL 조립으로 fetch 가능 (5/17 검증).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

// 2026-05-22 fix — site 가 mid query 필수로 변경. 누락 시 HTTP 400.
const LIST_URL = "https://www.pyeongtaek.go.kr/pyeongtaek/board/post/list.do?bcIdx=90&mid=0402010000";
const DETAIL_BASE =
  "https://www.pyeongtaek.go.kr/pyeongtaek/board/post/view.do?bcIdx=90&mid=0402010000&idx=";

// list anchor: <a ... data-req-get-p-idx="{NNN}">
//   안에: <span class="list_title">{title}</span>
//          <span class="list_data">작성일 YYYY.MM.DD 조회 N</span>
const LIST_ITEM_REGEX =
  /data-req-get-p-idx="(\d+)"[\s\S]*?<span\s+class="list_title">\s*([가-힣][^<]{4,}?)\s*<\/span>[\s\S]*?<span\s+class="list_data">\s*작성일\s+(\d{4})\.(\d{2})\.(\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = re.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    // W1 일관성 (5/17): decodeBasicEntities 호출. title 에 &hellip; &middot; 등이
    // 있을 때 raw 노출 방지 (5/17 commit d948039 후속).
    const title = decodeBasicEntities(m[2]).trim();
    if (!title) continue;
    const publishedDate = `${m[3]}-${m[4]}-${m[5]}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
  }
  return items;
}

// 본문 — <div class="view_cont"> 안 첫 <div class="mT10*"> 가 본문
const BODY_REGEX =
  /<div\s+class="view_cont">[\s\S]*?<div\s+class="mT10[^"]*">([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapePyeongtaekAndInsert } =
  createPressCollector({
    cityName: "평택시",
    region: "경기",
    ministry: "평택시청",
    sourceOutlet: "평택시청",

    sourceCode: "local-press-pyeongtaek",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
