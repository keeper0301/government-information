// ============================================================
// 인천 남동구청 보도자료 수집 (2026-05-26) — 인천 자치구 batch
// ============================================================
// 인천 남동구 인구 50만. 서구·부평·연수와 동일 CMS (bbsMsgDetail.do).
// 도메인 namdong.go.kr — 직접 도메인 (incheon.kr subdomain X).
//
// URL:
//   list:   /main/news/report.jsp
//   상세:   /main/bbs/bbsMsgDetail.do?msg_seq=N&bcd=report
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.namdong.go.kr";
const LIST_URL = "https://www.namdong.go.kr/main/news/report.jsp";

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*bbsMsgDetail\.do[^"]*msg_seq=(\d+)[^"]*bcd=report[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|bbs_view|content|cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file)|<\/article|<\/section)/i;

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
      sourceUrl: `${BASE_URL}/main/bbs/bbsMsgDetail.do?msg_seq=${seq}&bcd=report`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
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

export const { scrapeAndInsert: scrapeNamdongIncheonAndInsert } =
  createPressCollector({
    cityName: "남동구",
    region: "인천",
    ministry: "남동구청",
    sourceOutlet: "남동구청",
    sourceCode: "local-press-namdong-incheon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
