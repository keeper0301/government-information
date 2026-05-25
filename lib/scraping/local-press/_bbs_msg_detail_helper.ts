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
};

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*bbsMsgDetail\.do[^"]*msg_seq=(\d+)[^"]*bcd=report[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|bbs_view|content|cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file)|<\/article|<\/section)/i;

export function createBbsMsgDetailCollector(cfg: BbsMsgDetailConfig) {
  const listUrl = `${cfg.baseUrl}${cfg.listPath}`;

  function parseListPage(html: string): PressNewsItem[] {
    const items: PressNewsItem[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
    while ((m = itemRe.exec(html)) !== null) {
      const seq = m[1];
      if (seen.has(seq)) continue;
      seen.add(seq);
      const title = decodeBasicEntities(
        m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
      ).trim();
      if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
      const slice = html.slice(m.index, m.index + 1500);
      const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
      const publishedDate = dateMatch
        ? dateMatch[1].replace(/\./g, "-")
        : null;
      items.push({
        seq,
        title,
        publishedDate,
        sourceUrl: `${cfg.baseUrl}${cfg.detailBasePath}/bbsMsgDetail.do?msg_seq=${seq}&bcd=report`,
      });
    }
    return items;
  }

  function parseDetailBody(html: string): string | null {
    const m = BODY_CONTAINER_REGEX.exec(html);
    if (!m) return null;
    const text = decodeBasicEntities(m[1])
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!/[가-힣]/.test(text) || text.length < 50) return null;
    return text.slice(0, 5000);
  }

  return createPressCollector({
    cityName: cfg.cityName,
    region: cfg.region,
    ministry: cfg.ministry,
    sourceOutlet: cfg.ministry,
    sourceCode: cfg.sourceCode,
    listUrl,
    parseListItems: parseListPage,
    parseDetailBody,
  });
}
