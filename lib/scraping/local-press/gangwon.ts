import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://state.gwd.go.kr";
const LIST_URL = "https://state.gwd.go.kr/portal/briefing/pressRelease";

const LIST_ROW_REGEX =
  /<tr\s+data-prboard-seq="(\d+)"[^>]*>[\s\S]*?<td\s+class="skinTb-sbj">\s*<a\s+href="\/portal\/briefing\/pressRelease\?seq=\d+"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td\s+class="skinTb-date">(\d{4}-\d{2}-\d{2})<\/td>/g;

// 2026-05-22 fix — gangwon site 가 본문을 짧은 <p>title</p> 만 두고 hwp 첨부에 본문.
// 기존 regex 첫 close div 에서 끊겨 본문 31자 → skip 50자 가드 fail.
// 끝점을 copyright-bx 까지로 확장 — 본문 + 첨부 파일 title 모두 포함.
const BODY_CONTENT_REGEX =
  /<div\s+class="skinTb-td skinTb-conts"[^>]*>([\s\S]*?)<div\s+class="copyright-bx"/i;
const BODY_CONTENT_REGEX_LEGACY =
  /<div\s+class="skinTb-td skinTb-conts"[^>]*>([\s\S]*?)<\/div>/i;
const ATTACH_SECTION_REGEX =
  /<div\s+class="skinTb-td attachFile"[^>]*>([\s\S]*?)<div\s+class="copyright-bx"/i;
const ATTACH_FALLBACK_REGEX =
  /<div\s+class="skinTb-td attachFile"[^>]*>([\s\S]*?)<\/div>/i;
const ATTACH_TITLE_REGEX =
  /(?:title="([^"]+?)\s+다운로드"|<a[^>]*>\s*(?:<span[^>]*><\/span>\s*)?([^<]+?\.(?:hwp|hwpx|pdf|docx?)))/gi;

function toText(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ROW_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = toText(m[2]);
    if (!title || title.length < 5) continue;
    items.push({
      seq,
      title,
      publishedDate: m[3],
      sourceUrl: `${BASE_URL}/portal/briefing/pressRelease?seq=${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const parts: string[] = [];
  const bodyMatch = BODY_CONTENT_REGEX.exec(html) ?? BODY_CONTENT_REGEX_LEGACY.exec(html);
  if (bodyMatch) {
    parts.push(toText(bodyMatch[1]));
  }

  const attachMatch =
    ATTACH_SECTION_REGEX.exec(html) ?? ATTACH_FALLBACK_REGEX.exec(html);
  if (attachMatch) {
    let m: RegExpExecArray | null;
    const attachRe = new RegExp(ATTACH_TITLE_REGEX.source, "gi");
    while ((m = attachRe.exec(attachMatch[1])) !== null) {
      const title = toText(m[1] ?? m[2] ?? "");
      if (title) parts.push(title);
    }
  }

  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeGangwonAndInsert } = createPressCollector({
  cityName: "강원특별자치도",
  region: "강원",
  ministry: "강원특별자치도청",
  sourceOutlet: "강원특별자치도청",
  sourceCode: "local-press-gangwon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
