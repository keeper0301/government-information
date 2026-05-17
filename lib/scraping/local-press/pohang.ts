// ============================================================
// 포항시 보도자료 수집 — G4 Phase B (helper 활용, SI 표준 SPA GET 우회)
// ============================================================
// URL:
//   list:   /news/board/post/list.do?bcIdx=644&mid=0102000000
//   상세:   /news/board/post/view.do?bcIdx=644&mid=0102000000&idx={NNN}
// SI 표준 (평택과 같은 yhLib.inline.post) 이지만 mid 파라미터 없으면 referer 가드
// "잘못된 접근입니다" alert. 정상 list URL 은 홈 → 보도자료 link 에서 추출.
// list selector 가 평택과 달라 (`<span class="tit">`, `<span class="date">`) 별도 작성.
// 본문 container 는 평택과 동일 (view_cont > mT10).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.pohang.go.kr/news/board/post/list.do?bcIdx=644&mid=0102000000";
const DETAIL_BASE =
  "https://www.pohang.go.kr/news/board/post/view.do?bcIdx=644&mid=0102000000&idx=";

// list anchor: data-req-get-p-idx="{NNN}" + <span class="tit">{title}</span> + <span class="date">YYYY-MM-DD(요일)</span>
const LIST_ITEM_REGEX =
  /data-req-get-p-idx="(\d+)"[\s\S]*?<span\s+class="tit"[^>]*>\s*([가-힣][^<]{4,}?)\s*<\/span>[\s\S]*?<span\s+class="date"[^>]*>\s*(\d{4})-(\d{2})-(\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = re.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title) continue;
    const publishedDate = `${m[3]}-${m[4]}-${m[5]}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
  }
  return items;
}

// 본문 — view_cont 안 mT10 (평택과 같은 SI 표준)
const BODY_REGEX =
  /<div\s+class="view_cont">[\s\S]*?<div\s+class="mT10[^"]*">([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapePohangAndInsert } = createPressCollector({
  cityName: "포항시",
  region: "경북",
  ministry: "포항시청",
  sourceOutlet: "포항시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
