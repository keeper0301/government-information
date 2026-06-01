// ============================================================
// 경상남도 도청 보도자료 수집 (Phase 1 — 광역도 4번째)
// ============================================================
// 인구 335만. CMS: 경남도청 board CMS (jeonbuk 와 유사 패턴).
//   - list URL: /index.gyeong?menuCd=DOM_000000135002001000 (frame wrapper)
//     실제 board endpoint 가 view link 안에 있는 menuCd 와 동일 → list 도 같은 menuCd
//   - link: <a href="/board/view.gyeong?dataSid=N..."> 제목 (multiline)
//   - 본문: <div class="bbs_view"> 추정 (한국 정부 board CMS 표준)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gyeongnam.go.kr";
const LIST_URL =
  "https://www.gyeongnam.go.kr/index.gyeong?menuCd=DOM_000000135002001000";

// multiline <a href="..."> 제목 </a> 패턴. categoryCode1=A 보도자료 카테고리.
const LIST_ITEM_REGEX =
  /<a\s+href="\/board\/view\.gyeong[^"]*?dataSid=(\d+)[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g;

// 작성일 — list 안 td.date 또는 별도 위치. 일단 YYYY-MM-DD 패턴
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

// 2026-05-22 — 경남도청이 se-contents 편집기 본문 구조로 변경.
// 기존 bbs_view 가 매칭되지 않아, 새 본문 구조와 예전 구조를 함께 지원.
// 2026-06-02 fix — 본문 컨테이너 변경(se-contents → conText). 본문 0건 복구. div 깊이 추적.
const BODY_OPEN_REGEX = /<div[^>]*\bclass="conText"[^>]*>/i;

export function parseListPage(html: string): PressNewsItem[] {
  // 2026-05-20 subagent review hot-fix — 각 link 매치 위치 +800 char slice 안에서만
  // date 추출. 옛 코드의 dates[] 전체 array 매칭은 footer/script date 까지 잡혀
  // items[i] ↔ dates[i] 어긋날 위험.
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
    const publishedDate = dateMatch ? dateMatch[1] : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/board/view.gyeong?boardId=BBS_0000060&menuCd=DOM_000000135002001000&dataSid=${seq}`,
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
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return text.length >= 50 ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeGyeongnamAndInsert } = createPressCollector({
  cityName: "경상남도",
  region: "경남",
  ministry: "경상남도청",
  sourceOutlet: "경상남도청",
  sourceCode: "local-press-gyeongnam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
