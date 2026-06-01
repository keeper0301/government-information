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

// 본문 — div.contenttext (남양주 CMS). 중첩 div 가 깊어 div depth 추적으로 끝을 찾는다.
// 2026-06-02 — 기존 board_text_td/view-con/cms_content selector 는 남양주 CMS 에 없어
//   <p> fallback 91자(요약)만 수집 → factory 250 전량 skip 이었음. contenttext 로 교정.
const BODY_OPEN_REGEX = /<div[^>]*\bclass="[^"]*\bcontenttext\b[^"]*"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = BODY_OPEN_REGEX.exec(html);
  if (open) {
    const start = open.index + open[0].length;
    const tagRe = /<(\/?)div\b[^>]*>/gi;
    tagRe.lastIndex = start;
    let depth = 1;
    let raw: string | null = null;
    let dm: RegExpExecArray | null;
    while ((dm = tagRe.exec(html)) !== null) {
      if (dm[1] === "/") {
        depth -= 1;
        if (depth === 0) {
          raw = html.slice(start, dm.index);
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (raw !== null) {
      const text = decodeBasicEntities(
        raw
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]+/g, " ")
          .trim(),
      )
        // 선두 비한글 잡음(소제목 머리 "- " 등) 제거 — 본문은 시·기관명 등 한글로 시작.
        .replace(/^[^가-힣]*/, "");
      if (/[가-힣]/.test(text) && text.length >= 250) {
        return text.slice(0, 20000);
      }
    }
  }

  // Fallback — <p> 한국어 다수 (contenttext 부재/짧음 대비)
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
  if (joined.length < 250) return null;
  return joined.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeNamyangjuAndInsert } =
  createPressCollector({
    cityName: "남양주시",
    region: "경기",
    ministry: "남양주시청",
    sourceOutlet: "남양주시청",

    sourceCode: "local-press-namyangju",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
