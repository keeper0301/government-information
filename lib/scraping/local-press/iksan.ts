// ============================================================
// 익산시 보도자료 수집 — G4 Phase B (helper 활용, planweb 9is CMS)
// ============================================================
// URL:
//   list:   /index.9is?menuUid=ff80808198eafcbd019902ab48032c02 (보도자료 메뉴)
//   상세:   /board/post/view.do?boardUid=...&menuUid=...&postUid={alphanumeric}
// list 는 9is 확장자 (planweb CMS), detail 은 .do 표준. table 기반 (data-cell-header).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "http://www.iksan.go.kr/index.9is?menuUid=ff80808198eafcbd019902ab48032c02";
const DETAIL_BASE_ORIGIN = "http://www.iksan.go.kr";

// list anchor: <a href="/board/post/view.do?...postUid={alphanumeric}" title="{title}">
const LIST_ITEM_REGEX =
  /<a\s+href="(\/board\/post\/view\.do\?[^"]*postUid=([a-z0-9]+)[^"]*)"\s+title="([^"]+)"/g;

// 작성일: <td data-cell-header="작성일" class="date">\s*<strong ...>...</strong>\s*YYYY-MM-DD</td>
const DATE_REGEX =
  /<td\s+data-cell-header="작성일"\s+class="date">[\s\S]*?(\d{4})-(\d{2})-(\d{2})\s*<\/td>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const href = m[1];
    const seq = m[2];
    const title = decodeBasicEntities(m[3]).trim();
    if (!title) continue;
    if (seen.has(seq)) continue;
    seen.add(seq);
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE_ORIGIN}${href.replace(/&amp;/g, "&")}`,
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

// 2026-06-02 fix — 본문이 view_con div 에 정적 존재(hwp_editor 는 빈 div, JS 미렌더 미끼).
// 구 regex 는 `</div></td>` sentinel 의존이라 구조변경으로 0건 → div 깊이 추적으로 복구.
const VIEW_CON_OPEN = /<div[^>]*\bclass="[^"]*\bview_con\b[^"]*"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = VIEW_CON_OPEN.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, m.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null;
  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 여기선 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeIksanAndInsert } = createPressCollector({
  cityName: "익산시",
  region: "전북",
  ministry: "익산시청",
  sourceOutlet: "익산시청",

  sourceCode: "local-press-iksan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
