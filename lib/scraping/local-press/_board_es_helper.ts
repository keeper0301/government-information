// ============================================================
// board.es CMS helper (2026-05-26)
// ============================================================
// 정부 site 의 board.es CMS (mid/bid 식별자) 사용 collector 일관 패턴.
//
// 사용:
//   광주 남구 = createBoardEsCollector({
//     baseUrl: "https://www.namgu.gwangju.kr",
//     mid: "a10707060200", bid: "0001",
//     cityName: "광주 남구", region: "광주", ministry: "광주 남구청",
//     sourceCode: "local-press-namgu-gwangju",
//     titleStrategy: "attr",  // a tag 의 title attribute 사용 (남구·북구)
//   });
//
//   광주 서구·동구 = titleStrategy: "inner" (inner text 추출)
//
// 추가 board.es 사이트는 30줄 cfg 한 줄로 끝남.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

export type BoardEsConfig = {
  baseUrl: string; // 예: "https://www.namgu.gwangju.kr"
  mid: string; // 예: "a10707060200"
  bid: string; // 예: "0001"
  cityName: string;
  region: string;
  ministry: string;
  sourceCode: string; // 예: "local-press-namgu-gwangju"
  // title 추출 전략:
  //   "attr" — a tag 의 title attribute (남구·북구)
  //   "inner" — a tag 안 inner text (서구·동구)
  titleStrategy: "attr" | "inner";
  // 2026-05-26 review fix: inner 전략 a tag 안 nested HTML 크기 limit.
  // 광주 4 자치구는 500 충분. 다른 board.es site 가 큰 nested (img·div) 시 5000 권장.
  innerLimit?: number;
};

// board.es CMS 는 지자체 스킨마다 본문 컨테이너가 다르다. 순서대로 시도해 첫 clean 매칭 채택.
//   1) tb_contents 스킨 (광주 남·북·동구): <td/div class="tb_contents"> — td 에 colspan 등 속성 먼저 옴
//   2) board_view/contents 스킨 (광주 서구): <div class="contents">
//   3) 기존 view_cont 류 (그 외 board.es 사이트 대비 fallback)
// 끝 경계: 본문에 절대 안 나오는 구조 마커(첨부 add_file/file·버튼 btnArea·목록 goList)의
// 여는 '<' 직전까지 non-greedy. 본문 내 HWP/워드 export 중첩 table 영향 제거.
// file 마커는 컨테이너 태그(ul/div)로 한정 — 본문 내 인라인 <a class="file"> 다운로드
// 링크에 걸려 본문이 조기 절단되는 사고 방지 (code review).
// 길이 상한은 두지 않음: 본문에 base64 이미지가 박힌 글은 raw 캡처가 40만~110만 자라도
// clean 본문은 정상(600자 안팎)이라, 상한을 걸면 이미지 포함 글이 통째로 skip 됨(검증).
const BODY_END =
  '(?:<[a-z][^>]*class="[^"]*add_file|<[a-z][^>]*class="[^"]*btnArea|<(?:ul|div)[^>]*class="file"|<[a-z][^>]*onclick="goList|<strong[^>]*>\\s*첨부파일|<!--최초 파일만)';
const BODY_REGEXES: RegExp[] = [
  new RegExp(`class="[^"]*tb_contents[^"]*"[^>]*>([\\s\\S]*?)${BODY_END}`, "i"),
  new RegExp(`<div\\s+class="contents"[^>]*>([\\s\\S]*?)${BODY_END}`, "i"),
  /<div\s+class="(?:view_cont|board_view_body|cont_box|view_content|p-view__cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|p-view__bottom)|<\/article|<\/section)/i,
];

const DATE_REGEX = /(\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/g;

// board.es 상세 본문 추출 — cfg 무관(스킨만 봄)이라 모듈 레벨로 분리(단위 테스트용 export).
export function parseBoardEsDetailBody(html: string): string | null {
  for (const re of BODY_REGEXES) {
    const m = re.exec(html);
    if (!m) continue;
    const text = decodeBasicEntities(
      m[1]
        // MS Word/HWP export 조건부 주석 (<!--[if ...]-->) 제거
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (/[가-힣]/.test(text) && text.length >= 50) return text.slice(0, 5000);
  }
  return null;
}

export function createBoardEsCollector(cfg: BoardEsConfig) {
  const listUrl = `${cfg.baseUrl}/board.es?mid=${cfg.mid}&bid=${cfg.bid}`;
  const innerLimit = cfg.innerLimit ?? 500;
  // a tag title attribute 있으면 attr 전략. inner content 큰 site (img + span 등) 는 inner.
  const listItemRegex =
    cfg.titleStrategy === "attr"
      ? /<a[^>]*href="\/board\.es\?[^"]*list_no=(\d+)[^"]*"[^>]*title="([^"]+)"/g
      : new RegExp(
          `<a[^>]*href="\\/board\\.es\\?[^"]*list_no=(\\d+)[^"]*"[^>]*>([\\s\\S]{0,${innerLimit}}?)<\\/a>`,
          "g",
        );

  function parseListPage(html: string): PressNewsItem[] {
    const items: PressNewsItem[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    const itemRe = new RegExp(listItemRegex.source, "g");
    while ((m = itemRe.exec(html)) !== null) {
      const seq = m[1];
      if (seen.has(seq)) continue;
      seen.add(seq);
      // attr 전략 = m[2] 가 정확 title, inner 전략 = m[2] 가 nested HTML
      const rawTitle =
        cfg.titleStrategy === "attr"
          ? m[2]
          : m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const title = decodeBasicEntities(rawTitle).trim();
      if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
      const slice = html.slice(m.index, m.index + 1500);
      const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
      const publishedDate = dateMatch
        ? dateMatch[1].replace(/\//g, "-")
        : null;
      items.push({
        seq,
        title,
        publishedDate,
        sourceUrl: `${cfg.baseUrl}/board.es?mid=${cfg.mid}&bid=${cfg.bid}&act=view&list_no=${seq}`,
      });
    }
    return items;
  }

  return createPressCollector({
    cityName: cfg.cityName,
    region: cfg.region,
    ministry: cfg.ministry,
    sourceOutlet: cfg.ministry,
    sourceCode: cfg.sourceCode,
    listUrl,
    parseListItems: parseListPage,
    parseDetailBody: parseBoardEsDetailBody,
  });
}
