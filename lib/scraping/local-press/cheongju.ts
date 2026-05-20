// ============================================================
// 청주시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=40&key=23485
//   상세:   /www/selectBbsNttView.do?key=23485&bbsNo=40&nttNo={NNN}
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.cheongju.go.kr/www/selectBbsNttList.do?bbsNo=40&key=23485";
const DETAIL_BASE =
  "https://www.cheongju.go.kr/www/selectBbsNttView.do?key=23485&bbsNo=40&nttNo=";

// link + title: <a href="./selectBbsNttView.do?...nttNo={NNN}...">\s*{title}\s*</a>
const LIST_ITEM_REGEX =
  /<a\s+href="\.\/selectBbsNttView\.do\?[^"]*nttNo=(\d+)[^"]*"[^>]*>\s*([가-힣][^<]{4,})\s*<\/a>/g;

// 날짜: <td>YYYY.MM.DD</td>
const DATE_REGEX = /<td[^>]*>(\d{4})\.(\d{2})\.(\d{2})<\/td>/g;

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
    if (!title) continue;
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
    dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 상세 본문 — <td class="board_text_td"> 안 <br /> 분리 텍스트
const BODY_CONTAINER_REGEX =
  /<td[^>]*class="board_text_td"[^>]*>([\s\S]*?)<\/td>/;


export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
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

export const { scrapeAndInsert: scrapeCheongjuAndInsert } = createPressCollector({
  cityName: "청주시",
  region: "충북",
  ministry: "청주시청",
  sourceOutlet: "청주시청",

  sourceCode: "local-press-cheongju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
