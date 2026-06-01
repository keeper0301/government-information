// ============================================================
// 전북특별자치도 도청 보도자료 수집 (Phase 1 — 광역도 3번째)
// ============================================================
// 인구 175만. CMS: 전북자치도 newsroom 자체.
//   - list: <a href="/board/view.jeonbuk?dataSid=N"> 내부에 <strong>제목</strong>
//   - 작성일: "작성일 : YYYY-MM-DD" 패턴
//   - 본문 컨테이너: <div class="bbs_view">
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jeonbuk.go.kr";
const LIST_URL =
  "https://www.jeonbuk.go.kr/newsroom/board/list.jeonbuk?boardId=BBS_0000090&menuCd=DOM_000001101000000000";

// link + 같은 a tag 안 strong 제목 매칭 (multiline)
const LIST_ITEM_REGEX =
  /<a\s+href="\/board\/view\.jeonbuk[^"]*?dataSid=(\d+)[^"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/g;

// list 안 "작성일 : YYYY-MM-DD" 패턴
const DATE_REGEX = /작성일\s*:\s*(\d{4}-\d{2}-\d{2})/g;

// 본문 — div.bbs_con. bbs_view 안이 제목·메타(div.bbs_vtop)와 본문(div.bbs_con)으로
// 나뉘는 구조라, 본문 컨테이너만 지정. 중첩 div(figure 등)가 깊어 div depth 추적으로 끝을 찾는다.
// 2026-06-02 — 기존 bbs_view non-greedy 는 안쪽 첫 </div>(figure)에서 끊겨 88자(요약)만
//   추출 → factory 250 전량 skip 이었음. bbs_con 으로 교정 + figure(이미지 캡션) 제거.
const BODY_OPEN_REGEX = /<div[^>]*\bclass="[^"]*\bbbs_con\b[^"]*"[^>]*>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title || title.length < 5) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    items.push({
      seq,
      title,
      publishedDate: dateMatch ? dateMatch[1] : null,
      sourceUrl: `${BASE_URL}/board/view.jeonbuk?boardId=BBS_0000090&menuCd=DOM_000001101000000000&dataSid=${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const open = BODY_OPEN_REGEX.exec(html);
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
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeJeonbukAndInsert } = createPressCollector({
  cityName: "전북특별자치도",
  region: "전북",
  ministry: "전북특별자치도청",
  sourceOutlet: "전북특별자치도청",
  sourceCode: "local-press-jeonbuk",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
