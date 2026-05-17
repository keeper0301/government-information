// ============================================================
// 부산광역시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// CMS: /nbtnewsBU/{seq} 직접 link 패턴 (가장 단순).
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://www.busan.go.kr/nbtnewsBU";
const DETAIL_BASE = "https://www.busan.go.kr/nbtnewsBU/";

// list link: <a href="/nbtnewsBU/{seq}?...">{title}</a>
const LIST_ITEM_REGEX =
  /<a\s+href="\/nbtnewsBU\/(\d+)[^"]*"[^>]*>\s*([^<]{8,})\s*<\/a>/g;

// 날짜: YYYY-MM-DD 별도 위치
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

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
    if (seen.has(seq)) continue; // 같은 seq 중복 link 무시
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

// 본문 — <p> 한국어 추출 (서울/수원 동일 패턴)
export function parseDetailBody(html: string): string | null {
  const PARAGRAPH_REGEX = /<p[^>]*>([^<]{20,})<\/p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_REGEX.exec(html)) !== null) {
    const text = m[1]
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
    if (!/[가-힣]/.test(text)) continue;
    if (/element-invisible|첨부파일|문서보기/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n").slice(0, 5000);
}

export const { scrapeAndInsert: scrapeBusanAndInsert } = createPressCollector({
  cityName: "부산광역시",
  region: "부산",
  ministry: "부산광역시청",
  sourceOutlet: "부산광역시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
