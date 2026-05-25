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
};

// 광주 자치구 등 board.es CMS 표준 body container
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|board_view_body|cont_box|view_content|p-view__cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|p-view__bottom)|<\/article|<\/section)/i;

const DATE_REGEX = /(\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/g;

export function createBoardEsCollector(cfg: BoardEsConfig) {
  const listUrl = `${cfg.baseUrl}/board.es?mid=${cfg.mid}&bid=${cfg.bid}`;
  // a tag title attribute 있으면 attr 전략. inner content 큰 site (img + span 등) 는 inner.
  const listItemRegex =
    cfg.titleStrategy === "attr"
      ? /<a[^>]*href="\/board\.es\?[^"]*list_no=(\d+)[^"]*"[^>]*title="([^"]+)"/g
      : /<a[^>]*href="\/board\.es\?[^"]*list_no=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

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
