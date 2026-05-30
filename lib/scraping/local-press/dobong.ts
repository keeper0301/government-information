// ============================================================
// 도봉구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 4 (ASP 클래식)
// ============================================================
// site 가 ASP 기반. list page url 은 Contents.asp?code=N (=게시판 id)
// 인데, 보도자료 row 자체는 bbs.asp?bmode=D&pcode={N}&code=10008782 anchor.
// 이전 정찰에서 list 의 광고 banner (brand song / 캐릭터) anchor 가
// Contents.asp?code=N 패턴으로 같이 잡혀 사고. 보도자료는 명확히 bbs.asp 라
// regex 로 명확 구분 가능.
//
// URL:
//   list:   /Contents.asp?code=10008782
//   상세:   /bbs.asp?bmode=D&pcode={N}&code=10008782
//
// body: <div class="bbsCont"> 안 <div class="se-contents"> HWP 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.dobong.go.kr";
const LIST_URL = `${BASE_URL}/Contents.asp?code=10008782`;

// list anchor: <a href="./bbs.asp?bmode=D&amp;pcode={N}&amp;code=10008782">제목</a>
// HTML entity (&amp;) 가 source 에 그대로 있을 수 있어 [&]?amp;? 로 양면 대응.
// 2026-05-31 리뷰어 1-A: 풀 URL 변형 (https://www.dobong.go.kr/bbs.asp...) 대비 보강.
const LIST_ITEM_REGEX =
  /<a\s+href="(?:https?:\/\/[^"]*?)?\.?\/?bbs\.asp\?bmode=D&(?:amp;)?pcode=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

// list date: <td data-cell-header="등록일">YYYY.MM.DD</td>
const DATE_REGEX =
  /<td[^>]*data-cell-header="등록일"[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})/;

// 본문 container: bbsCont 안 se-contents (실제 본문 노드).
// se-contents 닫힘은 nested div 가 많아 단순 </div> 안 됨 — bbsCont wrap close 까지.
const BODY_CONTAINER_REGEX =
  /<div[^>]*class="bbsCont"[^>]*>([\s\S]{50,40000}?)<\/div>\s*(?:<\/div>|<div\s+class="(?:btnSet|contact|btn))/i;

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
    // anchor + 1200자 slice 안에서 date 추출 (같은 tr 안)
    const slice = html.slice(m.index, m.index + 1200);
    const dateMatch = DATE_REGEX.exec(slice);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/bbs.asp?bmode=D&pcode=${seq}&code=10008782`,
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

export const { scrapeAndInsert: scrapeDobongAndInsert } = createPressCollector({
  cityName: "도봉구",
  region: "서울",
  ministry: "도봉구청",
  sourceOutlet: "도봉구청",
  sourceCode: "local-press-dobong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
