// ============================================================
// 파주시청 보도자료 수집 (2026-06-11) — 경기 큰 시 확장
// ============================================================
// 인구 약 50만. eGovFrame BD_board. 보도자료 게시판 bbsCd=1023 (경로 /news/).
// 목록 행: <a onclick="jsView('1023','{seq}','N','Y')">제목</a> + 작성일 td(YYYY/MM/DD 슬래시).
// 상세: BD_board.view.do?bbsCd=1023&seq={seq}. 본문 .article-body (인라인 전문).
//
// URL:
//   list:  /news/user/board/BD_board.list.do?bbsCd=1023&q_ctgCds=5226,5227,5229
//   상세:  /news/user/board/BD_board.view.do?bbsCd=1023&seq={seq}
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.paju.go.kr";
const LIST_URL =
  "https://www.paju.go.kr/news/user/board/BD_board.list.do?bbsCd=1023&q_ctgCds=5226,5227,5229";

// 목록 행 anchor — onclick="jsView('1023','{17자리 seq}','N','Y')" + 제목 텍스트.
// bbsCd 1023 고정(보도자료). 제목 끝 <i class="ico-new">N</i> 배지는 태그제거로 사라짐.
const LIST_ITEM_REGEX =
  /onclick="jsView\('1023',\s*'(\d+)'[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/g;

// 파주 작성일은 YYYY/MM/DD (슬래시). 표준 점·하이픈과 함께 허용.
const DATE_REGEX = /(\d{4})[./\-](\d{2})[./\-](\d{2})/;

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
      m[2]
        .replace(/<!--[\s\S]*?-->/g, "") // <!-- 새글 --> 주석 제거
        .replace(/<i[^>]*ico-new[^>]*>[\s\S]*?<\/i>/gi, "") // NEW 배지 element 통째 제거
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // 같은 tr 안 작성일 td — 셀 사이 공백 많아 raw ~690자 위치 → 1200 창. 첫 매칭이라
    // 다음 글(아래 tr) 날짜는 안 잡힘(현재 행 날짜가 먼저 등장).
    const slice = html.slice(m.index, m.index + 1200);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/news/user/board/BD_board.view.do?bbsCd=1023&seq=${seq}`,
    });
  }
  return items;
}

// 본문 = .article-body 인라인 전문. lazy 매칭으로 article-body 닫는 태그까지만 추출
// (첨부·네비 형제 div 제외). article-body 안엔 보통 p·br·img 만 중첩(div 중첩 없음).
export function parseDetailBody(html: string): string | null {
  const m =
    /<div[^>]*class="[^"]*\barticle-body\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    );
  if (!m) return null;
  let text = m[1]
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  text = decodeBasicEntities(text).replace(/\s+/g, " ").trim();
  // 안전망: article-body 안에 드물게 footer/네비가 섞이면 그 직전에서 cut.
  const cut = text.search(/이전글|다음글|목록으로|이 페이지에서 제공|만족도/);
  if (cut > 30) text = text.slice(0, cut).trim();
  return text.length > 0 ? text : null;
}

export const { scrapeAndInsert: scrapePajuAndInsert } = createPressCollector({
  cityName: "파주시",
  region: "경기",
  ministry: "파주시청",
  sourceOutlet: "파주시청",
  sourceCode: "local-press-paju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
