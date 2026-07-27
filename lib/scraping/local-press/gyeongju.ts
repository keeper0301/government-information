// ============================================================
// 경북 경주시 시정뉴스 최신기사 수집 (2026-07-27)
// ============================================================
// 공식 시정뉴스 최신기사: /news/page.do?mnu_uid=1336
// 목록: newsList top card + list cards, detail parm_bod_uid
// 상세: board_view > view_tle/view_name/view_body visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gyeongju.go.kr";
const MNU_UID = "1336";
const LIST_URL = `${BASE_URL}/news/page.do?mnu_uid=${MNU_UID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r\f\v\u00a0]+/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\n\s*/g, "\n")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const match = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function detailUrl(id: string): string {
  return `${BASE_URL}/news/page.do?pageNo=1&pagePrvNxt=1&pageRef=0&pageOrder=0&step=258&parm_bod_uid=${id}&srchVoteType=-1&parm_mnu_uid=0&srchEnable=1&srchBgpUid=-1&srchKeyword=&srchSDate=&srchColumn=&srchEDate=&mnu_uid=${MNU_UID}&`;
}

function extractDivByClass(html: string, className: string): string | null {
  const openRe = new RegExp(
    `<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openMatch.index;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openMatch.index + openMatch[0].length, match.index);
    } else {
      depth += 1;
    }
  }
  return html.slice(openMatch.index + openMatch[0].length);
}

function titleFromSlice(slice: string): string {
  const dtLink = /<dt\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(slice)?.[1];
  const titleSpan = /<span\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(slice)?.[1];
  const plainLink = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(slice)?.[1];
  return stripTags(dtLink ?? titleSpan ?? plainLink ?? "");
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b[^>]*href=["']([^"']*\bparm_bod_uid=(\d+)[^"']*\bmnu_uid=1336[^"']*)["'][^>]*>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRe.exec(html)) !== null) {
    const id = linkMatch[2];
    if (!id || seen.has(id)) continue;

    const linkIndex = linkMatch.index;
    const start = Math.max(0, html.lastIndexOf("<li", linkIndex), html.lastIndexOf("<div", linkIndex));
    const endCandidates = [html.indexOf("</li>", linkIndex), html.indexOf("</dl>", linkIndex), html.indexOf("</div>", linkIndex)].filter((value) => value > linkIndex);
    const end = endCandidates.length ? Math.min(...endCandidates) : linkRe.lastIndex + 800;
    const slice = html.slice(start, end);
    const title = titleFromSlice(slice);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const date = normalizeDate(stripTags(/<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(slice)?.[1] ?? ""));

    seen.add(id);
    items.push({
      seq: id,
      title,
      publishedDate: date,
      sourceUrl: detailUrl(id),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const detail = extractDivByClass(html, "board_view");
  if (!detail) return null;

  const title = stripTags(/<h4\b[^>]*class=["'][^"']*\bview_tle\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i.exec(detail)?.[1] ?? "");
  const meta = stripTags(/<dl\b[^>]*class=["'][^"']*\bview_name\b[^"']*["'][^>]*>([\s\S]*?)<\/dl>/i.exec(detail)?.[1] ?? "");
  const contentHtml = extractDivByClass(detail, "view_body") ?? "";
  const content = stripTags(contentHtml);
  const body = [title, meta, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "경북 경주시",
  region: "경북",
  ministry: "경북 경주시청",
  sourceOutlet: "경북 경주시청",
  sourceCode: "local-press-gyeongju",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeGyeongjuAndInsert = collector.scrapeAndInsert;
