// ============================================================
// 고양특례시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /news/user/bbs/BD_selectBbsList.do?q_bbsCode=1090&q_estnColumn1=All
//   상세:   /news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn={17자리}&q_estnColumn1=All
// onclick: fnView('1090', '{17자리 seq}', '/news', 'All') 패턴
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.goyang.go.kr/news/user/bbs/BD_selectBbsList.do?q_bbsCode=1090&q_estnColumn1=All";
const DETAIL_BASE =
  "https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_estnColumn1=All&q_bbscttSn=";

// list onclick: onclick="fnView('1090','{17자리 seq}','/news', 'All');"
const LIST_ITEM_REGEX =
  /onclick="fnView\(\s*'1090'\s*,\s*'(\d{17})'[^)]*\)[^>]*>\s*([^<]+?)\s*</g;

// 날짜: <td class="date">YYYY.MM.DD</td>
const DATE_REGEX = /<td[^>]*class="date"[^>]*>(\d{4})\.(\d{2})\.(\d{2})<\/td>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    const title = m[2].trim();
    if (!seq || !title || title.length < 5) continue;
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
    dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 상세 본문 — <div id="webView" class="article-detail">...</div>
// 또는 mobileView. webView 우선 (PC 본문).
const BODY_CONTAINER_REGEX =
  /<div\s+id="webView"\s+class="article-detail"[^>]*>([\s\S]*?)<\/div>\s*<div\s+id="mobileView"/;
const BODY_FALLBACK_REGEX =
  /<div\s+id="mobileView"\s+class="article-detail"[^>]*>([\s\S]*?)<\/div>\s*<div/;

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
  let m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) m = BODY_FALLBACK_REGEX.exec(html);
  if (!m) return null;

  const text = decodeEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );

  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeGoyangAndInsert } = createPressCollector({
  cityName: "고양특례시",
  region: "경기",
  ministry: "고양특례시청",
  sourceOutlet: "고양특례시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
