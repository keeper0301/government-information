// ============================================================
// 관악구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 2
// ============================================================
// eGovFrame site/{slug}/ex/bbs (cbIdx=295). list anchor 는 href="#view" 의
// JS dispatch — onclick="doBbsFView('cbIdx','bcIdx','mainIdx','subIdx')" 에서
// bcIdx 추출해서 View.do?cbIdx=N&bcIdx=N 직접 호출.
//
// URL:
//   list:   /site/gwanak/ex/bbs/List.do?cbIdx=295
//   상세:   /site/gwanak/ex/bbs/View.do?cbIdx=295&bcIdx={N}
//
// body: <div class="view_contents"> 안 <div class="txt-area"> 안 <div class="se-contents">
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gwanak.go.kr";
const LIST_URL = `${BASE_URL}/site/gwanak/ex/bbs/List.do?cbIdx=295`;

// list anchor: <a href="#view" onclick="doBbsFView('295','201079','16010100','201079');">
// bcIdx = 두 번째 인자. title attribute 에 제목 (anchor 안 텍스트와 동일).
const LIST_ITEM_REGEX =
  /<a\s+href="#view"\s+onclick="doBbsFView\('295','(\d+)'[^"]*"[^>]*title="([^"]*)"[^>]*>/g;

// list date: <td class="wdate">YYYY.MM.DD</td> — 같은 row.
const DATE_REGEX = /<td\s+class="wdate">\s*(\d{4})\.(\d{2})\.(\d{2})/;

// 본문 container: view_contents 안 모두. 닫힘은 view-nuri 또는 board-prevnext.
const BODY_CONTAINER_REGEX =
  /<div[^>]*class="view_contents"[^>]*>([\s\S]{50,40000}?)<\/div>\s*(?:<div\s+class="view-nuri|<\/div>\s*<form\s+id="bbsFVo)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    // title attribute 안 텍스트. 끝에 (YYYY.M.D.) 포함될 수 있어 그대로 사용.
    const title = decodeBasicEntities(m[2]).replace(/\s+/g, " ").trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // anchor + 2500자 안에서 date 찾기 (관악 list 의 td 사이 공백이 많아 buffer 넓게)
    const slice = html.slice(m.index, m.index + 2500);
    const dateMatch = DATE_REGEX.exec(slice);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/site/gwanak/ex/bbs/View.do?cbIdx=295&bcIdx=${seq}`,
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
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGwanakAndInsert } = createPressCollector({
  cityName: "관악구",
  region: "서울",
  ministry: "관악구청",
  sourceOutlet: "관악구청",
  sourceCode: "local-press-gwanak",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
