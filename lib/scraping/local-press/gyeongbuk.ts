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

// 본문 컨테이너 — 표준 board content 패턴. 미확정 시 td.content 또는 div.bbs_view 시도.
const BODY_CONTAINER_REGEX =
  /<(?:div|td)\s+(?:class|id)="(?:bbs_view|content|board_view|view_content)"[^>]*>([\s\S]*?)<\/(?:div|td)>/i;

export function parseListPage(html: string): PressNewsItem[] {
  // 2026-05-20 subagent review hot-fix — 각 link 매치 위치 +800 char slice 안에서만
  // date 추출. 옛 코드의 dates[] 전체 array 매칭은 footer/script date 까지 잡혀
  // items[i] ↔ dates[i] 어긋날 위험.
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
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

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 50 ? text : null;
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
