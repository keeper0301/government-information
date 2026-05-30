// ============================================================
// 마포구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 3
// ============================================================
// /site/main/board/press/{seq} CMS. eGovFrame 변형.
// 정찰: 정적 fetch 가능. list <a class="s-line2"> + 별도 <td>YYYY.MM.DD</td>.
//
// URL:
//   list:   /site/main/board/press/list
//   상세:   /site/main/board/press/{seq}
//
// body: <div class="bbs_view_body"> 안 본문. 다음 <div class="bbs_view_open">
//       또는 <div class="bbs_view_prevnext"> 까지가 본문 영역.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.mapo.go.kr";
const LIST_URL = `${BASE_URL}/site/main/board/press/list`;

// list anchor: <a href="/site/main/board/press/{seq}?cp=...&bcId=press&...">제목</a>
// bcId=press 가드로 다른 게시판 anchor (mapopress·rss) 제외.
const LIST_ITEM_REGEX =
  /<a\s+href="\/site\/main\/board\/press\/(\d+)\?[^"]*bcId=press[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

// list date: 같은 row 의 <td>YYYY.MM.DD</td> 안만 매칭 (본문 미리보기·첨부파일명에
// 우연히 YYYY.MM.DD 가 있어 오추출되는 사고 방지 — 리뷰어 Major #1)
const DATE_REGEX = /<td[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})/;

// 본문 container: bbs_view_body 다음 bbs_view_open / bbs_view_prevnext / </article>
const BODY_CONTAINER_REGEX =
  /<div[^>]*class="bbs_view_body"[^>]*>([\s\S]{50,40000}?)<\/div>\s*(?:<div\s+class="bbs_view_(?:open|prevnext)|<\/article)/i;

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
    // anchor + 1500자 안에서 date 추출 (마포는 td column 이 여러개라 buffer 넉넉히)
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = DATE_REGEX.exec(slice);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/site/main/board/press/${seq}`,
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

export const { scrapeAndInsert: scrapeMapoAndInsert } = createPressCollector({
  cityName: "마포구",
  region: "서울",
  ministry: "마포구청",
  sourceOutlet: "마포구청",
  sourceCode: "local-press-mapo",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
