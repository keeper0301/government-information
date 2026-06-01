// ============================================================
// 은평구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 46만. SI 표준 selectBbsNttList (송파·군포 동일 CMS).
// 도메인 www.ep.go.kr, path /www/. bbsNo=48, key=762.
//
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=48&key=762
//   상세:   /www/selectBbsNttView.do?bbsNo=48&nttNo=N&key=762
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
//
// ⚠️ list anchor 의 href 가 search 파라미터 6개로 길어(<a>~</a> 716자),
//    title 캡처 window 를 {0,900} 으로 넓힘 (기본 500 이면 </a> 못 닿아 0건).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.ep.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=48&key=762`;

// title 캡처 {0,900} — 은평 anchor href param 체인이 길어 </a> 가 500자 밖.
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=48)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,900}?)<\/a>/g;

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
    // 은평은 anchor(716자)+부서 td 뒤에 작성일 td 가 와서 date 가 anchor +1315 위치.
    // 2000자 buffer 로 작성일 td 까지 포함 (1200 이면 날짜 누락 → null_date audit 유발).
    const slice = html.slice(m.index, m.index + 2000);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1].replace(/\./g, "-") : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=48&nttNo=${seq}&key=762`,
    });
  }
  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeEunpyeongAndInsert } =
  createPressCollector({
    cityName: "은평구",
    region: "서울",
    ministry: "은평구청",
    sourceOutlet: "은평구청",
    sourceCode: "local-press-eunpyeong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
