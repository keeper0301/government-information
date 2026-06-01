// ============================================================
// 광산구청 보도자료 수집 (2026-05-22) — 광주광역시 자치구 1번째
// ============================================================
// 광산구 인구 40만. 광주광역시 (gwangju.ts) 와 동일 system (boardList/boardView).
//   - boardId: REPORT_NEW · pageId: www16
//
// URL:
//   list:   /boardList.do?boardId=REPORT_NEW&pageId=www16
//   상세:   /boardView.do?boardId=REPORT_NEW&pageId=www16&seq=N
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gwangsan.go.kr";
const LIST_URL =
  "https://www.gwangsan.go.kr/boardList.do?boardId=REPORT_NEW&pageId=www16";

// 2026-06-02 fix — 사이트 구조 변경(광주광역시와 분기). list 0건 사고 복구.
//   구: <div class="subject"><a ...seq=N title="...">  (5/28 부터 깨짐)
//   신: <td class="subject"><a href="...boardId=REPORT_NEW&seq=N" data-view>제목</a></td>
//       (제목이 title 속성 → anchor 텍스트, div → td, 날짜는 같은 row 의 plain <td>)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*boardId=REPORT_NEW[^"]*seq=(\d+)[^"]*"[^>]*data-view[^>]*>([\s\S]{0,150}?)<\/a>/g;

const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;

// 2026-06-02 fix — 본문 컨테이너도 변경: board_view_body → boardContents (div 깊이 추적).
const BODY_OPEN_REGEX = /<div[^>]*\bclass="boardContents[^"]*"[^>]*>/i;

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
    // 같은 row 의 작성일 td (anchor 뒤 부서 td 다음). 500자 안 첫 YYYY-MM-DD.
    const slice = html.slice(m.index, m.index + 500);
    const d = DATE_REGEX.exec(slice);
    items.push({
      seq,
      title,
      publishedDate: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
      sourceUrl: `${BASE_URL}/boardView.do?boardId=REPORT_NEW&pageId=www16&seq=${seq}`,
    });
  }
  return items;
}

// 본문 <div class="boardContents ..."> — div 깊이 추적(중첩 div 안전, 닫는 div 없으면 null).
export function parseDetailBody(html: string): string | null {
  const open = BODY_OPEN_REGEX.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let mm: RegExpExecArray | null;
  while ((mm = tagRe.exec(html)) !== null) {
    if (mm[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, mm.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null;

  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGwangsanAndInsert } = createPressCollector(
  {
    cityName: "광산구",
    region: "광주",
    ministry: "광산구청",
    sourceOutlet: "광산구청",
    sourceCode: "local-press-gwangsan",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
