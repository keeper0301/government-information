// ============================================================
// 화성특례시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /www/user/bbs/BD_selectBbsList.do?q_bbsCode=1051
//   상세:   /www/user/bbs/BD_selectBbs.do?q_bbsCode=1051&q_bbscttSn={17자리}
// 수원과 동일 SI 표준 (BD_select 패턴). 직접 href.
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.hscity.go.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1051";
const DETAIL_BASE =
  "https://www.hscity.go.kr/www/user/bbs/BD_selectBbs.do?q_bbsCode=1051&q_bbscttSn=";

const LIST_ITEM_REGEX =
  /<a\s+href="BD_selectBbs\.do\?q_bbsCode=1051&(?:amp;)?q_bbscttSn=(\d{14,})[^"]*"[^>]*>([가-힣][^<]{4,})<\/a>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    const title = m[2].trim();
    if (!title) continue;
    seen.add(seq);
    // seq 앞 8자리 = YYYYMMDD (용인과 동일 패턴)
    const publishedDate =
      seq.length >= 8
        ? `${seq.slice(0, 4)}-${seq.slice(4, 6)}-${seq.slice(6, 8)}`
        : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
  }
  return items;
}

// 본문 — board_text_td 또는 일반 <p> fallback (용인/수원 패턴)
const BODY_REGEXES: RegExp[] = [
  /<td[^>]*class="board_text_td"[^>]*>([\s\S]*?)<\/td>/,
  /<div\s+class="board[_-]?view[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
];

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

export function parseDetailBody(html: string): string | null {
  for (const re of BODY_REGEXES) {
    const m = re.exec(html);
    if (!m) continue;
    const text = decodeEntities(
      m[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim(),
    );
    if (/[가-힣]/.test(text) && text.length >= 50) {
      return text.slice(0, 5000);
    }
  }

  // Fallback — <p> 한국어 다수 (용인 동일 패턴)
  const PARAGRAPH_REGEX = /<p[^>]*>([^<]{20,})<\/p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_REGEX.exec(html)) !== null) {
    const text = decodeEntities(m[1].trim());
    if (!/[가-힣]/.test(text)) continue;
    if (/element-invisible|첨부파일|문서보기|jsView|fileDownload/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length === 0) return null;
  const joined = paragraphs.join("\n");
  if (joined.length < 50) return null;
  return joined.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeHwaseongAndInsert } =
  createPressCollector({
    cityName: "화성특례시",
    region: "경기",
    ministry: "화성특례시청",
    sourceOutlet: "화성특례시청",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
