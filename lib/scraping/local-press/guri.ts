import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";
import { nextDifferentIdIndex } from "./_date_window";

const BASE_URL = "https://guri.go.kr";
const LIST_URL =
  "https://guri.go.kr/www/selectBbsNttList.do?bbsNo=42&key=393";

// 2026-05-26 inner limit {0,500} → {0,5000} (a 안 nested 큰 thumb 가 첫 match 막음)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=42)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,5000}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // 2026-06-03 — 날짜가 anchor 에서 ~1700자 뒤라 800 으론 못 잡아 fallback 되던 것 → 2200.
    // 2026-06-11 — 윈도우 끝을 '다음 글(다른 nttNo)' 직전으로 제한(_date_window). 행 간격
    // 좁을 때 옆 글 날짜 오취득 방지. 다음 글 없으면 2200 유지(엄격히 비회귀).
    const boundary = nextDifferentIdIndex(html, m.index, "nttNo", seq);
    const end =
      boundary >= 0 ? Math.min(boundary, m.index + 2200) : m.index + 2200;
    const slice = html.slice(m.index, end);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=42&nttNo=${seq}&key=393`,
    });
  }
  return items;
}

// 본문 파싱은 SI selectBbsNttView 공용 헬퍼 사용 (p-table__content/bbs_content 셀).
export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeGuriAndInsert } = createPressCollector({
  cityName: "구리시",
  region: "경기",
  ministry: "구리시청",
  sourceOutlet: "구리시청",
  sourceCode: "local-press-guri",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
