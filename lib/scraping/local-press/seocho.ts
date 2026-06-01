// ============================================================
// 서초구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 41만. eGovFrame site/{slug}/ex/bbs (cbIdx=61), UTF-8 정적.
// 메인(www.seocho.go.kr/)은 빈 shell → /site/seocho/main.do 가 실제 콘텐츠.
// ⚠️ 관악·양천과 같은 site/ex/bbs 계열이나 list anchor 방식이 다름:
//   관악=href="#view"+doBbsFView onclick / 서초=직접 href View.do?...bcIdx + doBbsContentFView.
//
// list: <td class="title"><a href="...View.do?cbIdx=61&bcIdx={N}" ...>제목</a></td>
//       + <td data-label="등록일">YYYY-MM-DD</td>.
// 상세: /site/seocho/ex/bbs/View.do?cbIdx=61&bcIdx={N} (GET).
// 본문: <div class="view_contents"> (div 깊이 추적 — 양천의 view-nuri sentinel 없음).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.seocho.go.kr";
const LIST_URL = `${BASE_URL}/site/seocho/ex/bbs/List.do?cbIdx=61`;

// 직접 href bcIdx 추출. cbIdx=61& 종결로 cbIdx=610 등 오인 방지. &amp; 인코딩 허용.
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*View\.do\?cbIdx=61&(?:amp;)?bcIdx=(\d+)[^"]*"[^>]*>([\s\S]{0,150}?)<\/a>/g;

// 같은 row 작성일: <td data-label="등록일">YYYY-MM-DD
const DATE_REGEX = /data-label="등록일"[^>]*>\s*(\d{4})-(\d{2})-(\d{2})/;

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
    // anchor(href+onclick+긴 제목)가 커서 등록일 td 가 ~800자 위치 → 1100 buffer.
    const slice = html.slice(m.index, m.index + 1100);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/site/seocho/ex/bbs/View.do?cbIdx=61&bcIdx=${seq}`,
    });
  }
  return items;
}

// 본문 <div class="view_contents"> — div 깊이 추적 (중첩 div 안전, 닫는 div 없으면 null).
const VIEW_OPEN_REGEX = /<div[^>]*\bclass="view_contents"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = VIEW_OPEN_REGEX.exec(html);
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
  if (raw === null) return null; // 닫는 div 없음(응답 잘림) → junk 방지

  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeSeochoAndInsert } = createPressCollector({
  cityName: "서초구",
  region: "서울",
  ministry: "서초구청",
  sourceOutlet: "서초구청",
  sourceCode: "local-press-seocho",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
