// ============================================================
// 전라남도 도청 보도자료 수집 (Phase 1 — 광역도 도청)
// ============================================================
// 사장님 거주지 매칭 가치 1순위. 사장님 (전남 순천) 의 상위 행정 (전라남도) 정책 노출.
//
// CMS: 전남도청 자체 (M7116 board CMS).
//   - list link: <a href="/M7116/boardView.do?seq=숫자&..." title="제목">제목</a>
//   - 게시일: <span class="date">YYYY-MM-DD</span> (페이지에서 NEW 표시와 함께 노출)
//   - 본문 컨테이너: <div class="bbs_view_contnet"> (typo 그대로)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jeonnam.go.kr";
const LIST_URL =
  "https://www.jeonnam.go.kr/M7116/boardList.do?menuId=jeonnam0202000000";

// list <a href="/M7116/boardView.do?seq=N&..." title="제목">제목</a>
// title attribute 우선 (text content 와 동일) — entity 디코딩 후 사용
const LIST_ITEM_REGEX =
  /<a\s+href="\/M7116\/boardView\.do\?seq=(\d+)[^"]*"\s+title="([^"]+)"/g;

// 날짜 추출 — list 안에 class="date">YYYY-MM-DD 패턴. NEW 라벨 옆.
// 각 row 의 첫 발견 date 가 그 row 의 게시일.
const DATE_REGEX = /class="date">(\d{4}-\d{2}-\d{2})</g;

// 본문 컨테이너 — bbs_view_contnet (도청 CMS typo 그대로)
const BODY_CONTAINER_REGEX =
  /<div\s+class="bbs_view_contnet"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> = [];
  const dates: string[] = [];
  const seen = new Set<string>();

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
      sourceUrl: `${BASE_URL}/M7116/boardView.do?seq=${seq}&menuId=jeonnam0202000000`,
    });
    idx += 1;
  }

  // 날짜 — list 의 모든 date 순서대로 추출. items 와 1:1 매칭 (앞에서부터)
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

export const { scrapeAndInsert: scrapeJeonnamAndInsert } = createPressCollector({
  cityName: "전라남도",
  region: "전남",
  ministry: "전라남도청",
  sourceOutlet: "전라남도청",
  sourceCode: "local-press-jeonnam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
