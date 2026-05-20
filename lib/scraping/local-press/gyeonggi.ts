// ============================================================
// 경기도청 보도자료 수집 (Phase 1 — 광역도 도청 2번째)
// ============================================================
// 인구 1,360만 — 한국 최대. 매출 영향 1순위.
//
// CMS: 경기뉴스포털 (gnews.gg.go.kr) 자체.
//   - list link: <a href="/briefing/brief_gongbo_view.do;jsessionid=...?number=N..." class="txtLink">제목</a>
//     jsessionid 는 매 fetch 마다 변동 — number 만 추출 후 simple URL 로 재구성
//   - 본문 컨테이너: <div class="postBody">
//   - 날짜: 20XX.XX.XX 포맷
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://gnews.gg.go.kr";
const LIST_URL = "https://gnews.gg.go.kr/briefing/brief_gongbo.do";

// txtLink class + brief_gongbo_view link 패턴. jsessionid 변동성 무시.
const LIST_ITEM_REGEX =
  /<a\s+href="\/briefing\/brief_gongbo_view\.do[^"]*?number=(\d+)[^"]*"[^>]*class="txtLink"[^>]*>([^<]+)<\/a>/g;

// 날짜 — list 의 YYYY.MM.DD 패턴 추출
const DATE_REGEX = /(\d{4})\.(\d{2})\.(\d{2})/g;

// 본문 — postBody div. div 종료까지 greedy match 의 비탐욕 버전.
const BODY_CONTAINER_REGEX =
  /<div\s+class="postBody"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<\/section|<\/article)/i;

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
      sourceUrl: `${BASE_URL}/briefing/brief_gongbo_view.do?BS_CODE=s017&number=${seq}&subject_Code=BO01`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(`${m[1]}-${m[2]}-${m[3]}`);
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

export const { scrapeAndInsert: scrapeGyeonggiAndInsert } = createPressCollector({
  cityName: "경기도",
  region: "경기",
  ministry: "경기도청",
  sourceOutlet: "경기도청",
  sourceCode: "local-press-gyeonggi",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
