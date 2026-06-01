// ============================================================
// 김해시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /03360/00023/00025.web
//   상세:   /00025.web?gcode=1172&idx={NNN}&amode=view
// gcode=1172 가 보도자료 카테고리. idx 가 article id.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://www.gimhae.go.kr/03360/00023/00025.web";
const DETAIL_BASE =
  "https://www.gimhae.go.kr/03360/00023/00025.web?gcode=1172&amode=view&idx=";

// list link: <a href="?gcode=1172&idx={NNN}&amode=view&" class="a1">...<strong class="t1">{title}</strong>
const LIST_ITEM_REGEX =
  /<a\s+href="\?gcode=1172&(?:amp;)?idx=(\d+)[^"]*"\s+class="a1"[^>]*>[\s\S]*?<strong\s+class="t1"[^>]*>([\s\S]*?)<\/strong>/g;

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
    if (seen.has(seq)) continue;
    // <i class="ic1 new"><span class="t1">새 글</span></i> 등 icon child 제거 (텍스트까지)
    const title = m[2]
      .replace(/<i\b[\s\S]*?<\/i>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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

// 본문 — div.substance (영도·창원과 동일 CMS). 중첩 div 가 깊어 non-greedy 가
// 첫 </div> 에서 끊기므로 div depth 추적으로 컨테이너 끝을 찾는다.
// 2026-06-02 — 기존 board_text_td/view-con selector 는 김해 CMS 에 존재하지 않아
//   <p> fallback 71자(요약)만 수집 → factory 250 전량 skip 이었음. .substance 로 교정.
const BODY_OPEN_REGEX = /<div[^>]*\bclass="substance"[^>]*>/i;

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
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\r/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]+/g, " ")
          .trim(),
      )
        // .substance 선두에 사진 슬라이더 잡음(&lsaquo;/&rsaquo; ‹› 화살표 + 빈 슬라이드 줄)
        // 이 본문 앞 ~250자를 차지 → 첫 한글 등장 전 비한글 잡음을 제거. 보도자료 본문은
        // 시·기관명 등 한글로 시작하므로 의미 손실 없음.
        .replace(/^[^가-힣]*/, "");
      if (/[가-힣]/.test(text) && text.length >= 250) {
        return text.slice(0, 20000);
      }
    }
  }

  // Fallback — <p> 한국어 다수 (.substance 부재/짧음 대비)
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

export const { scrapeAndInsert: scrapeGimhaeAndInsert } = createPressCollector({
  cityName: "김해시",
  region: "경남",
  ministry: "김해시청",
  sourceOutlet: "김해시청",

  sourceCode: "local-press-gimhae",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
