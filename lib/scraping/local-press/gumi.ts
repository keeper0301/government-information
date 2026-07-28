// ============================================================
// 경북 구미시 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /portal/contents.do?mid=0504020000
// 정적 목록: /portal/board/post/list.do?bcIdx=211&mid=0504020000
// 목록: YH bod_webzine cards + data-req-get-p-idx
// 상세: bod_view > subject/view_info/view_cont visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gumi.go.kr";
const BC_IDX = "211";
const MID = "0504020000";
const LIST_URL = `${BASE_URL}/portal/board/post/list.do?bcIdx=${BC_IDX}&mid=${MID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
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
  return `${BASE_URL}/portal/board/post/view.do?bcIdx=${BC_IDX}&mid=${MID}&idx=${id}`;
}

function extractBlockByClass(html: string, tag: string, className: string): string | null {
  const openRe = new RegExp(
    `<${tag}\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
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

function itemSlices(html: string): string[] {
  const wrapper = extractBlockByClass(html, "div", "bod_webzine") ?? html;
  const slices: string[] = [];
  const itemRe = /<a\b[^>]*data-req-get-p-idx=["']\d+["'][^>]*>[\s\S]*?<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(wrapper)) !== null) slices.push(match[0]);
  return slices;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  for (const slice of itemSlices(html)) {
    const id = /data-req-get-p-idx=["'](\d+)["']/i.exec(slice)?.[1];
    if (!id || seen.has(id)) continue;

    const title = stripTags(
      /<span\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(slice)?.[1] ??
        /<span\b[^>]*class=["'][^"']*\bblind\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(slice)?.[1] ??
        "",
    ).replace(/게시글 상세보기$/g, "").trim();
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
  const detail = extractBlockByClass(html, "div", "bod_view");
  if (!detail) return null;

  const title = stripTags(extractBlockByClass(detail, "div", "subject") ?? "");
  const meta = stripTags(extractBlockByClass(detail, "div", "view_info") ?? "");
  const content = stripTags(extractBlockByClass(detail, "div", "view_cont") ?? "")
    .replace(/\[보건의료정책과\][^\n]+/g, " ")
    .replace(/바로 보기/g, " ")
    .trim();
  const body = [title, meta, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "경북 구미시",
  region: "경북",
  ministry: "경북 구미시청",
  sourceOutlet: "경북 구미시청",
  sourceCode: "local-press-gumi",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeGumiAndInsert = collector.scrapeAndInsert;
