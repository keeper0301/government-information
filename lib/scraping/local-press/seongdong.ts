// ============================================================
// 성동구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 28만. SI 표준 selectBbsNttList (송파·군포 동일 CMS).
// 도메인 www.sd.go.kr, path /main/. bbsNo=188, key=1477.
//
// URL:
//   list:   /main/selectBbsNttList.do?bbsNo=188&key=1477
//   상세:   /main/selectBbsNttView.do?bbsNo=188&nttNo=N&key=1477
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";
import { nextDifferentIdIndex } from "./_date_window";

const BASE_URL = "https://www.sd.go.kr";
const LIST_URL = `${BASE_URL}/main/selectBbsNttList.do?bbsNo=188&key=1477`;

// SI 표준 — query 순서 무관 lookahead(bbsNo 일치) + nttNo 캡처.
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=188)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

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
      .replace(/\s*\bNEW\s*$/, "") // 새 글 배지 strip (\b 로 RENEW 보호, \s* 로 배지 뒤 공백 허용)
      .replace(/새글$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // 날짜 추출 범위를 '다음 글(다른 nttNo) 등장 직전'까지로 제한해 인접 글 날짜
    // 침범 차단 (코드리뷰 P1 2026-06-08).
    const nextItemIdx = nextDifferentIdIndex(html, itemRe.lastIndex, "nttNo", seq);
    const sliceEnd =
      nextItemIdx === -1 ? m.index + 800 : Math.min(m.index + 800, nextItemIdx);
    const slice = html.slice(m.index, sliceEnd);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1].replace(/\./g, "-") : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/main/selectBbsNttView.do?bbsNo=188&nttNo=${seq}&key=1477`,
    });
  }
  return items;
}

// 성동 본문 전문은 첨부 PDF/hwp 에만(웹 셀은 "자세한 내용은 첨부를 확인하시기 바랍니다" 요약
// 89자뿐). SI 첨부 공용 헬퍼로 PDF/hwp 전문 추출, 부재 시 정적 본문 fallback.
// baseDir = detail URL 디렉터리(/main/) — 성동 href 는 절대경로(/main/downloadBbsFile.do).
export const parseDetailBody = (html: string) =>
  parseSiAttachOrBody(html, `${BASE_URL}/main/`);

export const { scrapeAndInsert: scrapeSeongdongAndInsert } =
  createPressCollector({
    cityName: "성동구",
    region: "서울",
    ministry: "성동구청",
    sourceOutlet: "성동구청",
    sourceCode: "local-press-seongdong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
