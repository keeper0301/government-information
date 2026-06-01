// ============================================================
// 경상북도 도청 보도자료 수집 (Phase 1 — 광역도 5번째)
// ============================================================
// 인구 260만. CMS: gb.go.kr 자체 (BD_CODE=bbs_bodo board).
//   - list link: ./page.do?...BD_CODE=bbs_bodo&B_NUM=N...&V_NUM=14274
//   - title: a tag 의 title attribute (list 에서 일부 잘림 가능)
//   - 본문: detail page 의 본문 (parseDetailBody 에서 추출)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gb.go.kr";
// 2026-05-26 — 정확 LIST_URL fix. 이전 LARGE_CODE=720 등 잘못된 query 파라미터로
// "이미 삭제된 글" alert page 반환 (5/25 cron seq 508041401 alert 발화 진단).
const LIST_URL =
  "https://www.gb.go.kr/Main/page.do?BD_CODE=bbs_bodo&mnu_uid=6792";

// 2026-05-26 — 전체 href 추출 (V_NUM, B_STEP 동적 포함).
// 이전 V_NUM=14274 고정 detail URL 으로 "존재하지 않는 글" alert 진단.
const LIST_ITEM_REGEX =
  /<a\s+href="(\.\/page\.do\?(?=[^"]*BD_CODE=bbs_bodo)[^"]*?B_NUM=(\d+)[^"]*)"\s+title="([^"]+)"/g;

const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

// 2026-06-02 fix — 본문은 `cont_view` div 에 정적 존재(부제목+본문). 구 regex 는
// bbs_view(언더스코어) 등 실제 사이트에 없는 class 라 0건이었음.
// ⚠️ 핵심 함정: 제목이 HTML 주석 `<!--div class="view_title">...</div-->` 으로 감싸져
// 있어, 주석 닫는 `</div-->` 를 div 깊이 추적이 진짜 닫는 div 로 오인 → 제목에서 조기종료.
// → 주석을 깊이 추적 전에 먼저 제거해야 함. 끝 경계는 네비(bbsView) 형제 div 라 안 섞임.
const CONT_VIEW_OPEN = /<div[^>]*\bclass="[^"]*\bcont_view\b[^"]*"[^>]*>/i;

export function parseListPage(html: string): PressNewsItem[] {
  // 2026-05-20 subagent review hot-fix — 각 link 매치 위치 +800 char slice 안에서만
  // date 추출. 옛 코드의 dates[] 전체 array 매칭은 footer/script date 까지 잡혀
  // items[i] ↔ dates[i] 어긋날 위험.
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    // 2026-05-26 review nit#5: decode 단일화 — &amp; manual replace 와 decodeBasicEntities 2 경로 합침
    const href = decodeBasicEntities(m[1]);
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[3]).trim();
    if (!title || title.length < 5) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1] : null;
    // 2026-05-26: full href 그대로 사용 (V_NUM·B_STEP 동적 포함)
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/Main/${href.replace(/^\.\//, "")}`,
    });
  }

  return items;
}

export function parseDetailBody(htmlRaw: string): string | null {
  // 핵심: 주석 먼저 제거 — 주석 안 `</div-->` 가 깊이 추적을 오염시킴(제목 조기종료).
  const html = htmlRaw.replace(/<!--[\s\S]*?-->/g, " ");
  const open = CONT_VIEW_OPEN.exec(html);
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
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeGyeongbukAndInsert } = createPressCollector({
  cityName: "경상북도",
  region: "경북",
  ministry: "경상북도청",
  sourceOutlet: "경상북도청",
  sourceCode: "local-press-gyeongbuk",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
