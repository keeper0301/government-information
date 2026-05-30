// ============================================================
// 충청북도 도청 보도자료 수집 (Phase 1 — 광역도 7번째)
// ============================================================
// 인구 160만. CMS: 충북 selectBbsNtt (key=429, bbsNo=65 board).
//   - list link: ./selectBbsNttView.do?key=429&bbsNo=65&nttNo=N
//   - 본문: detail page 표준 컨테이너
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chungbuk.go.kr";
const LIST_URL =
  "https://www.chungbuk.go.kr/www/selectBbsNttList.do?bbsNo=65&key=429";

// 2026-05-22 fix — site 가 a 태그 안에 nested <span> 추가하면서 ([^<]+) 0 매칭.
// loose ([\s\S]{0,500}?) + tag strip 으로 대응.
const LIST_ITEM_REGEX =
  /<a\s+href="\.\/selectBbsNttView\.do\?key=429[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

// 2026-05-31 fix — chungbuk 실 site 본문 selector 가 contenttext (viewcontent 안 nested).
// 5/22 Phase B fix (bbs_view) 가 실제 selector 미커버 → fetched 10/inserted 0/skipped 10
// 패턴으로 cron 1주+ 0건. fix: contenttext + viewcontent 추가 (legacy 후보군 보존).
const BODY_CONTAINER_REGEX =
  /<(?:div|td)\s+(?:class|id)="(?:contenttext|viewcontent|bbs_view|content|board_view|view_content|tbl_view)"[^>]*>([\s\S]*?)<\/(?:div|td)>/i;

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
    // tag strip 후 decode (nested span 등 모두 제거)
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1] : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=429&bbsNo=65&nttNo=${seq}`,
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

export const { scrapeAndInsert: scrapeChungbukAndInsert } = createPressCollector({
  cityName: "충청북도",
  region: "충북",
  ministry: "충청북도청",
  sourceOutlet: "충청북도청",
  sourceCode: "local-press-chungbuk",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
