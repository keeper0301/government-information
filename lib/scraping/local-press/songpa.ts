// ============================================================
// 송파구청 보도자료 수집 (2026-05-22) — 자치구 확장 3번째
// ============================================================
// 인구 67만 (서울 자치구 1위). 처음엔 SPA 의심했으나, 사장님 chrome 검증 시 redirect:
//   /www/sub.do?key=2781 → /www/selectBbsNttList.do?bbsNo=96&key=2781
// = SI 표준 (chungbuk·노원 동일). 8,077+ 보도자료.
//
// URL:
//   list:   selectBbsNttList.do?bbsNo=96&key=2781
//   상세:   selectBbsNttView.do?bbsNo=96&nttNo=N&key=2781
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.songpa.go.kr";
const LIST_URL =
  "https://www.songpa.go.kr/www/selectBbsNttList.do?bbsNo=96&key=2781";

// SI 표준 — query 순서 무관 lookahead 매칭 (gyeongbuk 패턴)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=96)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

// 송파 site 표준: p-table__content 또는 bbs__view 또는 content-information
// 2026-06-03 — 본문 뒤 목록 버튼 + ul.p-post-move(이전글/다음글) + script(var) +
// 공공누리(kogl)가 컨테이너에 포함돼 junk 노출 → 끝 마커에 p-post-move 추가 +
// text 후처리로 목록 버튼·공공누리 푸터 cut.
const BODY_CONTAINER_REGEX =
  /<(?:div|td)\s+class="(?:p-table__content|bbs__view|content-information|p-wrap[^"]*bbs[^"]*view)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:p-table__bottom|btn|pagination)|<ul\s+class="p-post-move|<\/article|<\/section)/i;

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
    // 각 link +800 char slice 안에서 date
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=96&nttNo=${seq}&key=2781`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  // 2026-06-03 fix — 본문 컨테이너 안 <script>(fn_update 등) 블록 제거 (JS 코드 본문 혼입 버그).
  const text = decodeBasicEntities(
    m[1]
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    // 본문 앞 메타 블록 제거 — [table caption + 제목 + "조회수 N 작성일 : 날짜
    // 시:분:초 자료제공 [부서]"] 가 본문 앞에 섞임. "작성일 : YYYY년"(콜론+연도라
    // caption 의 "작성일" 은 미매칭) 부터 그 뒤 "자료제공 [부서]" 까지 통째 cut →
    // 순수 본문만. 제목은 title 필드에 별도 보존되므로 정보 손실 없음.
    // ⚠️ 메타는 항상 본문 앞 ~250자 — 길이 상한(앞 500자·사이 100자)으로 본문
    //    중간에 우연히 등장하는 "작성일 : 연도 … 자료제공" 의 본문 손실 방지.
    .replace(/^[\s\S]{0,500}?작성일\s*:\s*\d{4}년[\s\S]{0,100}?자료제공\s+\S+\s+/, "")
    // 공공누리 푸터(컨테이너 안에 있을 때) — "본 저작물은 … 공공누리" 동반일 때만
    // cut(본문 자연어 "본 저작물은" 단독 오제거 방지) + 끝 "목록" 버튼 텍스트 제거.
    .replace(/\s*본\s*저작물은[\s\S]{0,20}?공공누리[\s\S]*$/, "")
    .replace(/\s*목록\s*$/, "")
    .trim();
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeSongpaAndInsert } = createPressCollector({
  cityName: "송파구",
  region: "서울",
  ministry: "송파구청",
  sourceOutlet: "송파구청",
  sourceCode: "local-press-songpa",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
