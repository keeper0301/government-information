// ============================================================
// 종로구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 14만. eGovFrame selectBoardList CMS (UTF-8 정적). www.jongno.go.kr.
// 보도자료 게시판: bbsId=BBSMSTR_000000001618, menuId=388338.
// (메인 메뉴 "보도자료" 는 #none JS 라, "보도자료 더보기" 링크로 게시판 URL 확인)
//
// list: <a href="javascript:viewMove('nttId');">제목</a> + 같은 row 의
//       <td class="output date1">YYYY년MM월DD일</td>.
// 상세: selectBoardArticle.do?bbsId=...&menuId=...&menuNo=...&nttId={N} (GET).
// 본문: view_type01 표의 마지막 행 <td class="output"> ("내용" 라벨 + 본문, td-depth).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jongno.go.kr";
const BBS_ID = "BBSMSTR_000000001618";
const MENU_ID = "388338";
const LIST_URL = `${BASE_URL}/portal/bbs/selectBoardList.do?bbsId=${BBS_ID}&menuId=${MENU_ID}&menuNo=${MENU_ID}`;

// list anchor: href="javascript:viewMove('nttId');"
const LIST_ITEM_REGEX =
  /<a[^>]*href="javascript:viewMove\('(\d+)'\)[^"]*"[^>]*>([\s\S]{0,150}?)<\/a>/g;

// 같은 row 작성일 td: <td class="... date1 ...">YYYY년MM월DD일
const DATE_REGEX =
  /class="[^"]*date1[^"]*"[^>]*>\s*(\d{4})년(\d{2})월(\d{2})일/;

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
    // 같은 row 의 date1 td (anchor 뒤 800자 안). 다른 날짜(제목 내 (M.D.) 등) 오인 방지.
    const slice = html.slice(m.index, m.index + 800);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/portal/bbs/selectBoardArticle.do?bbsId=${BBS_ID}&menuId=${MENU_ID}&menuNo=${MENU_ID}&nttId=${seq}`,
    });
  }
  return items;
}

// 본문: view_type01 표 이후 첫 <td class="output"> 셀 (td 깊이 추적, 중첩 table 안전).
const VIEW_TYPE_MARKER = /class="view_type01"/i;
const OUTPUT_TD_OPEN = /<td[^>]*\bclass="output"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const vi = html.search(VIEW_TYPE_MARKER);
  if (vi < 0) return null;
  const after = html.slice(vi);
  const open = OUTPUT_TD_OPEN.exec(after);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)td\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(after)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = after.slice(start, m.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null; // 닫는 td 없음(응답 잘림) → junk 방지

  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    // 셀 머리 "내용" 라벨(blind 텍스트) 제거. 선행 공백 허용 + 뒤 공백 필수
    // (\s+) 로 "내용물" 같은 단어는 보호.
    .replace(/^\s*내용\s+/, "")
    .trim();
  // 2026-06-01 리뷰 — 본문 min 50 → 250 (AGENTS.md 룰·thin content/AdSense 방지 통일).
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJongnoAndInsert } = createPressCollector({
  cityName: "종로구",
  region: "서울",
  ministry: "종로구청",
  sourceOutlet: "종로구청",
  sourceCode: "local-press-jongno",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
