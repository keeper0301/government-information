// ============================================================
// 경상남도 도청 보도자료 수집 (Phase 1 — 광역도 4번째)
// ============================================================
// 인구 335만. CMS: 경남도청 board CMS (jeonbuk 와 유사 패턴).
//   - list URL: /index.gyeong?menuCd=DOM_000000135002001000 (frame wrapper)
//     실제 board endpoint 가 view link 안에 있는 menuCd 와 동일 → list 도 같은 menuCd
//   - link: <a href="/board/view.gyeong?dataSid=N..."> 제목 (multiline)
//   - 본문: <div class="bbs_view"> 추정 (한국 정부 board CMS 표준)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gyeongnam.go.kr";
const LIST_URL =
  "https://www.gyeongnam.go.kr/index.gyeong?menuCd=DOM_000000135002001000";

// multiline <a href="..."> 제목 </a> 패턴. categoryCode1=A 보도자료 카테고리.
const LIST_ITEM_REGEX =
  /<a\s+href="\/board\/view\.gyeong[^"]*?dataSid=(\d+)[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g;

// 작성일 — list 안 td.date 또는 별도 위치. 일단 YYYY-MM-DD 패턴
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="bbs_view"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<\/section|<\/article)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> = [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title || title.length < 5) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${BASE_URL}/board/view.gyeong?boardId=BBS_0000060&menuCd=DOM_000000135002001000&dataSid=${seq}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((item) => ({
    seq: item.seq,
    title: item.title,
    publishedDate: dates[item.idx] ?? null,
    sourceUrl: item.sourceUrl,
  }));
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

export const { scrapeAndInsert: scrapeGyeongnamAndInsert } = createPressCollector({
  cityName: "경상남도",
  region: "경남",
  ministry: "경상남도청",
  sourceOutlet: "경상남도청",
  sourceCode: "local-press-gyeongnam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
