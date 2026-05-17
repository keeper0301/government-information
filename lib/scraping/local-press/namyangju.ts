// ============================================================
// 남양주시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=68&key=2498
//   상세:   /www/selectBbsNttView.do?key=2498&bbsNo=68&nttNo={NNN}
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.nyj.go.kr/www/selectBbsNttList.do?bbsNo=68&key=2498";
const DETAIL_BASE =
  "https://www.nyj.go.kr/www/selectBbsNttView.do?key=2498&bbsNo=68&nttNo=";

// list link + title:
//   <a href="./selectBbsNttView.do?...nttNo={NNN}">...<em class="p-media__heading-text">{title}</em>
const LIST_ITEM_REGEX =
  /<a\s+href="\.\/selectBbsNttView\.do\?[^"]*nttNo=(\d+)[^"]*"[^>]*>[\s\S]*?<em\s+class="p-media__heading-text"[^>]*>\s*([^<]+?)\s*<\/em>/g;

// 날짜: <time class="p-split">YYYY-MM-DD</time>
const DATE_REGEX = /<time[^>]*class="p-split"[^>]*>(\d{4}-\d{2}-\d{2})<\/time>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    const title = m[2].trim();
    if (!title || title.length < 5) continue;
    seen.add(seq);
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 본문 — board_text_td 또는 일반 <p> fallback
const BODY_REGEXES: RegExp[] = [
  /<td[^>]*class="board_text_td"[^>]*>([\s\S]*?)<\/td>/,
  /<div\s+class="(?:board[_-]?view[_-]?content|view-con|article-detail|cms_content)[^"]*"[^>]*>([\s\S]*?)<\/div>/,
];


export function parseDetailBody(html: string): string | null {
  for (const re of BODY_REGEXES) {
    const m = re.exec(html);
    if (!m) continue;
    const text = decodeBasicEntities(
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

  // Fallback — <p> 한국어 다수
  const PARAGRAPH_REGEX = /<p[^>]*>([^<]{20,})<\/p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_REGEX.exec(html)) !== null) {
    const text = decodeBasicEntities(m[1].trim());
    if (!/[가-힣]/.test(text)) continue;
    if (/element-invisible|첨부파일|문서보기|fileDownload/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length === 0) return null;
  const joined = paragraphs.join("\n");
  if (joined.length < 50) return null;
  return joined.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeNamyangjuAndInsert } =
  createPressCollector({
    cityName: "남양주시",
    region: "경기",
    ministry: "남양주시청",
    sourceOutlet: "남양주시청",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
