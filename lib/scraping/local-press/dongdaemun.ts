// ============================================================
// 동대문구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 34만. SI 표준 selectBbsNttList (송파·군포 동일 CMS). path /www/.
// 메인(www.ddm.go.kr/)은 빈 shell → 실제 콘텐츠는 /www/index.do. 보도자료 bbsNo=39.
// ⚠️ bbsNo=39 짧아 prefix 충돌(bbsNo=390 등) 위험 → lookahead 종결자 필수.
//
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=39&key=199
//   상세:   /www/selectBbsNttView.do?bbsNo=39&nttNo=N&key=199
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.ddm.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=39&key=199`;

// {0,900} window + 종결자 bbsNo=39(?:&|") (짧은 bbsNo prefix 충돌 차단).
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=39(?:&|"))[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,900}?)<\/a>/g;

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
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // anchor(693자)+부서 td 뒤 작성일 td → 1600자 buffer (1000 이면 날짜 누락).
    const slice = html.slice(m.index, m.index + 1600);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=39&nttNo=${seq}&key=199`,
    });
  }
  return items;
}

// 동대문 본문 전문은 첨부 hwp 에만(웹 셀은 요약 65자뿐). SI 첨부 공용 헬퍼로 추출, 부재 시
// 정적 fallback. baseDir = detail URL 디렉터리(/www/) — href 는 상대경로(./downloadBbsFile.do).
export const parseDetailBody = (html: string) =>
  parseSiAttachOrBody(html, `${BASE_URL}/www/`);

export const { scrapeAndInsert: scrapeDongdaemunAndInsert } =
  createPressCollector({
    cityName: "동대문구",
    region: "서울",
    ministry: "동대문구청",
    sourceOutlet: "동대문구청",
    sourceCode: "local-press-dongdaemun",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
