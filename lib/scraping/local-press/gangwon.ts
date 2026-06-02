import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { toMarkdown } from "@ohah/hwpjs";

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

// 2026-06-02 — 강원 본문 전문은 첨부 hwp5 에만(웹은 제목 23자 thin). 첨부 hwp 를 @ohah/hwpjs
// 로 추출(라이브 PoC 736자). 첨부 download: detail 의 /egf/bp/common/front/{id}/download.
const DOWNLOAD_REGEX = /href="(\/egf\/bp\/common\/front\/\d+\/download)"/i;
const GW_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// hwp → markdown 결과를 평문으로. 표(보도자료 헤더 메타: 보도일시·담당·문의)·마크업·이미지 제거.
function cleanHwpMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/`{1,3}/g, "")
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*\|[^\n]*\|\s*$/gm, "")
    .replace(/^\s*\|?-{2,}.*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^버전:\s*[\d.]+\s*/, ""); // 선두 "버전: 5.00.05.00" 잡음 제거
}

async function fetchHwpBody(html: string): Promise<string | null> {
  const m = DOWNLOAD_REGEX.exec(html);
  if (!m) return null;
  try {
    const res = await fetch(`${BASE_URL}${m[1]}`, {
      headers: { "User-Agent": GW_UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // OLE(hwp5) 매직 D0CF 확인 — 다운로드가 HTML 에러페이지일 때 방어.
    if (buf[0] !== 0xd0 || buf[1] !== 0xcf) return null;
    const { markdown } = toMarkdown(buf, { image: "base64", useHtml: false });
    const text = cleanHwpMarkdown(markdown).replace(/\s+/g, " ").trim();
    return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
  } catch {
    return null;
  }
}

export async function parseDetailBody(html: string): Promise<string | null> {
  // 1) 첨부 hwp 전문 우선 (강원 본문은 hwp 에만)
  const hwpBody = await fetchHwpBody(html);
  if (hwpBody) return hwpBody;

  // 2) fallback: 기존 skinTb-conts + 첨부 title (제목 23자 thin → factory 250 skip)
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
