// ============================================================
// 울산광역시청 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   https://www.ulsan.go.kr/u/rep/contents.ulsan?mId=001004003001000000
//   상세:   /u/rep/bbs/view.ulsan?bbsId=BBS_0000000000000027&dataId={NNN}&mId=001004003001000000
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.ulsan.go.kr/u/rep/contents.ulsan?mId=001004003001000000";
const DETAIL_BASE = "https://www.ulsan.go.kr";
const MID = "001004003001000000";

// list link: <a href="./view.do?...&dataId={NNN}">{title}</a>
const LIST_ITEM_REGEX =
  /<a\s+href="\.\/view\.do\?[^"]*dataId=(\d+)[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g;

// 날짜: YYYY.MM.DD 형식 (다른 시·군 - 가 아님)
const DATE_REGEX = /(\d{4})\.(\d{2})\.(\d{2})/g;

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
      sourceUrl: `${DETAIL_BASE}/u/rep/bbs/view.ulsan?bbsId=BBS_0000000000000027&dataId=${seq}&mId=${MID}`,
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

// 상세 본문 — 본문이 한 <td> 안에 평문 + <br /> 으로 들어있음.
// 정확한 selector 없어 휴리스틱 — 한국어 100자+ <td> 중 가장 긴 것 선택.
export function parseDetailBody(html: string): string | null {
  const TD_REGEX = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let longest = "";
  let m: RegExpExecArray | null;
  while ((m = TD_REGEX.exec(html)) !== null) {
    const raw = m[1];
    // 본문 td 휴리스틱 — <br /> 다수 + 한국어 100자+
    const brCount = (raw.match(/<br\s*\/?>/gi) ?? []).length;
    if (brCount < 2) continue;
    const text = raw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    const koreanChars = (text.match(/[가-힣]/g) ?? []).length;
    if (koreanChars < 100) continue;
    if (text.length > longest.length) longest = text;
  }
  if (!longest || longest.length < 100) return null;
  return longest.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeUlsanAndInsert } = createPressCollector({
  cityName: "울산광역시",
  region: "울산",
  ministry: "울산광역시청",
  sourceOutlet: "울산광역시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
