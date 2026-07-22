// ============================================================
// 전남 곡성군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /kr/board/list.do?bbsId=BBS_000000000000151&menuNo=102001002000
// 목록: table.board_list rows + board/view.do nttId detail link
// 상세: div.board_view metadata + div.board_con body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gokseong.go.kr";
const BBS_ID = "BBS_000000000000151";
const MENU_NO = "102001002000";
const LIST_URL = `${BASE_URL}/kr/board/list.do?bbsId=${BBS_ID}&menuNo=${MENU_NO}`;

const LIST_LINK_REGEX =
  /<a\b[^>]*href=["']([^"']*\/kr\/board\/view\.do(?:;[^?"']*)?\?[^"']*\bbbsId=BBS_000000000000151[^"']*\bnttId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const LIST_DATE_REGEX = /<td\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4})[-.](\d{2})[-.](\d{2})\s*<\/td>/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_view\b[^"']*["'][^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>/i;
const DETAIL_DATE_REGEX = /<strong>\s*작성일\s*<\/strong>\s*:\s*(\d{4})[-.](\d{2})[-.](\d{2})/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_con\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*\bimg_box\b|<\/div>\s*<!-- \/\/board_list -->|<script\b)/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|\b새글\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(
    href.replace(/;[^?"']*(?=\?)/, "").replace(/&amp;/g, "&"),
    LIST_URL,
  ).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const linkRe = new RegExp(LIST_LINK_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(match[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const rowStart = html.lastIndexOf("<tr", match.index);
    const rowEnd = html.indexOf("</tr>", match.index + match[0].length);
    const rowHtml = html.slice(
      rowStart === -1 ? match.index : rowStart,
      rowEnd === -1 ? match.index + match[0].length : rowEnd + 5,
    );
    const dateMatch = LIST_DATE_REGEX.exec(rowHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({ seq, title, publishedDate, sourceUrl: makeAbsoluteUrl(href) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGokseongAndInsert } =
  createPressCollector({
    cityName: "전남 곡성군",
    region: "전남",
    ministry: "전남 곡성군청",
    sourceOutlet: "전남 곡성군청",
    sourceCode: "local-press-gokseong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
