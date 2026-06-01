// ============================================================
// 대전 서구청 보도자료 수집 (2026-06-01) — 광역시 자치구 확장
// ============================================================
// 인구 48만 (대전 최대 자치구). eGovFrame bbs (UTF-8 정적). www.seogu.go.kr.
// ⚠️ 광주 서구(seogu_gwangju)·인천 서구(seo_incheon)와 별개 → key=seogu_daejeon.
//
// list: <td class="subject"><button onclick="fn_search_detail('{nttId}')">
//         <strong class="bbs-subject-txt">제목</strong></button></td>
//       + <td class="regDate" data-cell-header="등록일">YYYY-MM-DD</td>.
//   nttId 는 영숫자(예: B000000217929Hk2sL3).
// 상세: /bbs/BBSMSTR_000000000277/view.do?nttId={nttId} (GET).
// 본문: <div class="ui bbs--view--cont"> (div 깊이 추적).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.seogu.go.kr";
const BBS_ID = "BBSMSTR_000000000277";
const LIST_URL = `${BASE_URL}/bbs/${BBS_ID}/list.do`;

// fn_search_detail('{nttId}') + 같은 항목의 strong.bbs-subject-txt 제목.
// tempered token (?!fn_search_detail) — strong 없는 공지행이 다음 항목 제목을 도용하는
// cross-item 오염 방지(리뷰 Major). 중간에 다른 fn_search_detail 나오면 매칭 끊김.
const LIST_ITEM_REGEX =
  /fn_search_detail\('([^']+)'\)(?:(?!fn_search_detail)[\s\S]){0,200}?<strong[^>]*class="bbs-subject-txt"[^>]*>([\s\S]{0,150}?)<\/strong>/g;

// 같은 row 등록일 td: <td ... class="regDate" ...>YYYY-MM-DD (또는 data-cell-header="등록일")
const DATE_REGEX =
  /(?:class="regDate"|data-cell-header="등록일")[^>]*>\s*(\d{4})-(\d{2})-(\d{2})/;

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
    )
      .replace(/\s*새글\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // 등록일 td (제목 td 다음 부서·조회수 지나서). row 가 커서(첨부 inline JS 등)
    // 2500자 buffer (1000 이면 날짜 누락). 첨부 td 의 inline 날짜 없어 cross-row 안전.
    const slice = html.slice(m.index, m.index + 2500);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/bbs/${BBS_ID}/view.do?nttId=${seq}`,
    });
  }
  return items;
}

// 본문 <div class="ui bbs--view--cont"> — div 깊이 추적 (중첩 div 안전).
const VIEW_CONT_OPEN = /<div[^>]*\bclass="ui bbs--view--cont"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = VIEW_CONT_OPEN.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, m.index);
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
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeSeoguDaejeonAndInsert } =
  createPressCollector({
    cityName: "대전 서구",
    region: "대전",
    ministry: "대전 서구청",
    sourceOutlet: "대전 서구청",
    sourceCode: "local-press-seogu-daejeon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
