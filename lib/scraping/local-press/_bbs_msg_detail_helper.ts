// ============================================================
// bbsMsgDetail CMS helper (2026-05-26)
// ============================================================
// 인천 자치구 (서구·부평·연수·남동·계양 등) 4+ collector 가 동일 CMS 사용.
// 80% 중복 코드 → helper 추출.
//
// 사용:
//   인천 남동구 = createBbsMsgDetailCollector({
//     baseUrl: "https://www.namdong.go.kr",
//     listPath: "/main/news/report.jsp",
//     detailBasePath: "/main/bbs",  // open_content 없는 자치구
//     cityName: "남동구", region: "인천", ministry: "남동구청",
//     sourceCode: "local-press-namdong-incheon",
//   });
//
//   인천 서구 = detailBasePath: "/open_content/main/bbs" (open_content 포함)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { nextDifferentIdIndex } from "./_date_window";

export type BbsMsgDetailConfig = {
  baseUrl: string; // 예: "https://www.namdong.go.kr"
  listPath: string; // 예: "/main/news/report.jsp"
  // detail URL base path. 자치구별 분기:
  //   open_content 있는 site: "/open_content/main/bbs"
  //   open_content 없는 site: "/main/bbs"
  detailBasePath: string;
  cityName: string;
  region: string;
  ministry: string;
  sourceCode: string;
  bcd?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|bbs_view|content|cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file)|<\/article|<\/section)/i;

// 2026-06-02 — 부평·계양·강화는 본문이 `board_view`(class 중간, 예: "general_board board_view")
// div 에 정적 존재(hwp_editor 빈 div 는 미끼). div 깊이 추적으로 추출. 없으면 null → fallback.
// 서구 등은 board_view 미사용 → null → 기존 regex 로 처리(무영향).
const BOARD_VIEW_OPEN = /<div[^>]*\bclass="[^"]*\bboard_view\b[^"]*"[^>]*>/i;

function extractBoardViewRaw(html: string): string | null {
  const open = BOARD_VIEW_OPEN.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  return null; // 닫는 div 없음
}

export function createBbsMsgDetailCollector(cfg: BbsMsgDetailConfig) {
  const listUrl = `${cfg.baseUrl}${cfg.listPath}`;
  const bcd = cfg.bcd ?? "report";
  // 2026-06-02 — bcd 와 msg_seq 의 query 파라미터 순서가 사이트마다 다름
  // (namdong=msg_seq 먼저, ongjin=bcd 먼저). lookahead 로 bcd 존재만 확인(순서 무관)
  // 한 뒤 msg_seq 를 추출 → 두 순서 모두 매칭.
  const listItemRegex = new RegExp(
    `<a[^>]*href="(?=[^"]*\\bbcd=${escapeRegExp(
      bcd,
    )}\\b)[^"]*bbsMsgDetail\\.do[^"]*\\bmsg_seq=(\\d+)[^"]*"[^>]*>([\\s\\S]{0,500}?)<\\/a>`,
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
      const title = decodeBasicEntities(
        m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
      ).trim();
      if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
      // 날짜 추출 범위를 '다음 글(다른 msg_seq) 등장 직전'까지로 제한해 인접 글
      // 날짜 침범 차단 (코드리뷰 P1 2026-06-08).
      const nextItemIdx = nextDifferentIdIndex(html, itemRe.lastIndex, "msg_seq", seq);
      const sliceEnd =
        nextItemIdx === -1 ? m.index + 1500 : Math.min(m.index + 1500, nextItemIdx);
      const slice = html.slice(m.index, sliceEnd);
      const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
      const publishedDate = dateMatch
        ? dateMatch[1].replace(/\./g, "-")
        : null;
      items.push({
        seq,
        title,
        publishedDate,
        sourceUrl: `${cfg.baseUrl}${cfg.detailBasePath}/bbsMsgDetail.do?msg_seq=${seq}&bcd=${bcd}`,
      });
    }
    return items;
  }

  function parseDetailBody(html: string): string | null {
    // board_view div 우선(부평·계양·강화), 비거나 없으면 기존 regex(서구 등) fallback.
    const candidates = [
      extractBoardViewRaw(html),
      BODY_CONTAINER_REGEX.exec(html)?.[1] ?? null,
    ];
    for (const raw of candidates) {
      if (raw === null) continue;
      const text = decodeBasicEntities(
        raw
          // 2026-06-03 — board_view 안 네비(ul.other_con: 이전글/다음글) 제거.
          .replace(/<ul[^>]*\bother_con[^>]*>[\s\S]*?<\/ul>/gi, " ")
          .replace(/<!--[\s\S]*?-->/g, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
        // 2026-06-10 — "첨부파일 [파일명…]" 목록만 surgical 제거. 이전(2026-06-03)엔 첨부파일
        // 이후 전부 cut 했으나, 본문이 첨부 목록 뒤에 오는 site(강화·인천동구·인천서구)는 본문
        // 전체가 잘려 insert 0 회귀했음. 첨부 라벨+확장자 파일명 시퀀스만 제거해 본문 위치 무관.
        .replace(
          /첨부파일\s*(?:\S+\.(?:hwp|hwpx|pdf|jpe?g|png|gif|zip|xlsx?|docx?|pptx?|txt|gul|bmp|hwt)\b\s*)+/gi,
          " ",
        )
        // 2026-06-11 — 파일크기 [NMByte]/(NMByte) 표시도 surgical 제거. 이전엔 "이후 전부 cut"
        // 이었으나, 첨부(+파일크기)가 본문 앞에 오는 site(인천 동구)는 파일크기 뒤 본문이
        // 통째로 잘려 insert 0 회귀(6/2~). 토큰만 제거해 본문 위치와 무관하게 보존.
        // (첨부가 본문 뒤인 강화·계양·부평은 본문 보존 동일 — 이후 네비 cut 이 잔재 처리.)
        .replace(/[[(]\s*[\d.]+\s*[KMG]?Byte\s*[\])]/gi, " ")
        // 끝에 남는 네비 cut (이전글/다음글/미리보기 목록). 첨부파일·파일크기는 위에서 surgical 처리.
        .replace(
          /\s*(?:이전글|다음글|미리보기 목록)[\s\S]*$/,
          "",
        )
        .replace(/\s*목록\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (/[가-힣]/.test(text) && text.length >= 50) return text.slice(0, 20000);
    }
    return null;
  }

  return {
    ...createPressCollector({
      cityName: cfg.cityName,
      region: cfg.region,
      ministry: cfg.ministry,
      sourceOutlet: cfg.ministry,
      sourceCode: cfg.sourceCode,
      listUrl,
      parseListItems: parseListPage,
      parseDetailBody,
    }),
    // 2026-06-02 — PC runner(processProvidedHtml via _pc_runner_cfgs)·단위 테스트용
    // parse 함수 노출. 기존 호출처는 { scrapeAndInsert } 구조분해라 무영향.
    parseListItems: parseListPage,
    parseDetailBody,
  };
}
