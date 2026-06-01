// ============================================================
// 성북구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 42만. SI 표준 selectBbsNttList (송파·군포 동일 CMS). path /www/.
// 메인(www.sb.go.kr/)은 빈 shell → /www/index.do 가 실제 콘텐츠. 보도자료 bbsNo=46.
// ⚠️ bbsNo=46 짧아 prefix 충돌(bbsNo=460 등) 위험 → lookahead 종결자 필수.
//
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=46&key=6356
//   상세:   /www/selectBbsNttView.do?bbsNo=46&nttNo=N&key=6356
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.sb.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=46&key=6356`;

// {0,900} window + 종결자 bbsNo=46(?:&|") (짧은 bbsNo prefix 충돌 차단).
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=46(?:&|"))[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,900}?)<\/a>/g;

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
    // anchor href param 체인 대비 1600자 buffer (작성일 td 가 멀리 올 수 있음).
    const slice = html.slice(m.index, m.index + 1600);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=46&nttNo=${seq}&key=6356`,
    });
  }
  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeSeongbukAndInsert } =
  createPressCollector({
    cityName: "성북구",
    region: "서울",
    ministry: "성북구청",
    sourceOutlet: "성북구청",
    sourceCode: "local-press-seongbuk",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
