// ============================================================
// 대구광역시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   info.daegu.go.kr/newshome/mtnmain.php?mtnkey=scatelist&mkey=26
//   상세:   info.daegu.go.kr/newshome/mtnmain.php?mtnkey=articleview&mkey=scatelist&mkey2=1&aid={NNN}
// 초기 진단 = SPA + AJAX 추정 보류. 실제는 보도자료 전용 sub-domain (info.*) 에서
// GET 으로 응답. www 사이트의 메뉴 link 가 info sub-domain 으로 외부 이동 (5/17).
// list page 에는 date 없음 → published_at 는 _factory 가 now() fallback.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "http://info.daegu.go.kr/newshome/mtnmain.php?mtnkey=scatelist&mkey=26";
const DETAIL_BASE_ORIGIN = "http://info.daegu.go.kr/newshome/";

// list anchor: <a href="./mtnmain.php?...aid={NNN}" title="{title}"><p class="title">{title}</p></a>
const LIST_ITEM_REGEX =
  /<a\s+href="(\.\/mtnmain\.php\?mtnkey=articleview[^"]*aid=(\d+))"\s+title="([^"]+)"/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = re.exec(html)) !== null) {
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[3]).trim();
    if (!title) continue;
    const href = m[1].replace(/^\.\//, "").replace(/&amp;/g, "&");
    items.push({
      seq,
      title,
      // list 에 date 없음 → _factory 가 now() fallback (cron 실행 시간)
      publishedDate: null,
      sourceUrl: `${DETAIL_BASE_ORIGIN}${href}`,
    });
  }
  return items;
}

// 본문 — article_view_content 안 (br + p 혼합, 이미지 포함)
const BODY_REGEX =
  /<div\s+class="article_view_content"[^>]*>([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<img[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeDaeguAndInsert } = createPressCollector({
  cityName: "대구광역시",
  region: "대구",
  ministry: "대구광역시청",
  sourceOutlet: "대구광역시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
