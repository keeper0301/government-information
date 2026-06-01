// ============================================================
// 금천구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 23만. SI 표준 selectBbsNttList (송파·군포 동일 CMS). path /portal/.
// ⚠️ 메인 메뉴의 bbsNo=150151 은 인터넷방송(영상 갤러리)라 부적합.
//    진짜 텍스트 보도자료 게시판 = bbsNo=8, key=297.
// ⚠️ bbsNo=8 은 짧아 prefix 충돌(bbsNo=80·800 등) 위험 → lookahead 에 종결자
//    `bbsNo=8(?:&|")` 필수 (다른 게시판 사이드 링크 오매칭 방지).
//
// URL:
//   list:   /portal/selectBbsNttList.do?bbsNo=8&key=297
//   상세:   /portal/selectBbsNttView.do?bbsNo=8&nttNo=N&key=297
// 본문: SI 공용 헬퍼(bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.geumcheon.go.kr";
const LIST_URL = `${BASE_URL}/portal/selectBbsNttList.do?bbsNo=8&key=297`;

// title 캡처 {0,900} — 금천 anchor href param 체인이 길어 </a> 가 522자(>500).
// lookahead `bbsNo=8(?:&|")` — bbsNo=8 뒤가 & 또는 따옴표여야 매칭(bbsNo=80 배제).
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=8(?:&|"))[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,900}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

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
      // "새글" 배지 strip — 한글이라 \b 미적용(\b 는 ASCII 단어경계). 배지는 글 끝 span.
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // anchor(522자)+부서 td 뒤 작성일 td → 1000자 buffer.
    const slice = html.slice(m.index, m.index + 1000);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/portal/selectBbsNttView.do?bbsNo=8&nttNo=${seq}&key=297`,
    });
  }
  return items;
}

// 본문 파싱은 SI selectBbsNttView 공용 헬퍼 사용 (bbs_content 셀).
export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeGeumcheonAndInsert } =
  createPressCollector({
    cityName: "금천구",
    region: "서울",
    ministry: "금천구청",
    sourceOutlet: "금천구청",
    sourceCode: "local-press-geumcheon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
