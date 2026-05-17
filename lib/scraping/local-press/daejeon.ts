// ============================================================
// 대전광역시청 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   https://www.daejeon.go.kr/drh/board/boardNormalList.do?boardId=normal_0189&menuSeq=6825
//   상세:   /drh/board/boardNormalView.do?...&ntatcSeq={NNNN}
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.daejeon.go.kr/drh/board/boardNormalList.do?boardId=normal_0189&menuSeq=6825";
const DETAIL_BASE = "https://www.daejeon.go.kr";

// title link: <td class="al_left subject"><a href="...ntatcSeq={NNN}"><strong>{title}</strong></a></td>
const LIST_ITEM_REGEX =
  /<td[^>]*class="al_left subject"[^>]*>\s*<a\s+href="([^"]*ntatcSeq=\d+[^"]*)"[^>]*>\s*<strong>([^<]+)<\/strong>/g;
// 대전 list 의 date 별도 td. <td>2026-05-16</td> 형식 (다른 td 와 충돌 가능)
const DATE_REGEX = /<td[^>]*>(\d{4}-\d{2}-\d{2})<\/td>/g;
// ntatcSeq 추출
const NTATC_REGEX = /ntatcSeq=(\d+)/;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
    const seqMatch = NTATC_REGEX.exec(href);
    if (!seqMatch) continue;
    const seq = seqMatch[1];
    const title = m[2].trim();
    if (!title) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: href.startsWith("http") ? href : `${DETAIL_BASE}${href}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 상세 본문 — <div class="board_txt"> 안 <p><span>...텍스트... (hwp 변환)
const BODY_CONTAINER_REGEX =
  /<div\s+class="board_txt"[^>]*>([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  let text = m[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeDaejeonAndInsert } = createPressCollector({
  cityName: "대전광역시",
  region: "대전",
  ministry: "대전광역시청",
  sourceOutlet: "대전광역시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
