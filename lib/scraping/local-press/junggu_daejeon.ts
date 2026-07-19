// ============================================================
// 대전 중구청 보도/보도해명 수집 (2026-07-19) — 자치구 확장
// ============================================================
// 공식 보도/보도해명: /prog/bbsArticle/BBSMSTR_000000000137/list.do?mno=sub03_07
// 목록: fn_search_detail('{nttId}') + td.subject / td.regDate
// 상세: /prog/bbsArticle/BBSMSTR_000000000137/view.do?nttId={nttId}&mno=sub03_07
// 본문: <div class="ui bbs--view--cont"><div class="ui bbs--view--content">...</div>
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.djjunggu.go.kr";
const BBS_ID = "BBSMSTR_000000000137";
const LIST_PATH = `/prog/bbsArticle/${BBS_ID}/list.do?mno=sub03_07`;
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const LIST_ITEM_REGEX =
  /<tr>[\s\S]*?<td[^>]*data-cell-header="제목"[^>]*class="subject"[^>]*>[\s\S]*?fn_search_detail\('([^']+)'\)[\s\S]*?<\/a>[\s\S]*?<td[^>]*data-cell-header="등록일"[^>]*class="regDate"[^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/td>/g;

const TITLE_REGEX = /<a[^>]*>[\s\S]*?([^<>][\s\S]*?)<\/a>/i;
const VIEW_CONT_OPEN = /<div[^>]*\bclass="ui bbs--view--cont"[^>]*>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const row = match[0];
    const titleMatch = row.match(TITLE_REGEX);
    const title = decodeBasicEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `${match[2]}-${match[3]}-${match[4]}`,
      sourceUrl: `${BASE_URL}/prog/bbsArticle/${BBS_ID}/view.do?nttId=${seq}&mno=sub03_07`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const open = VIEW_CONT_OPEN.exec(html);
  if (!open) return null;

  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, match.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null;

  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJungguDaejeonAndInsert } =
  createPressCollector({
    cityName: "대전 중구",
    region: "대전",
    ministry: "대전 중구청",
    sourceOutlet: "대전 중구청",
    sourceCode: "local-press-junggu-daejeon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
