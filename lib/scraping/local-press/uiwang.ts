// ============================================================
// 의왕시청 보도자료 수집 (2026-05-22)
// ============================================================
// 의왕시 인구 16만. 5,864+ 보도자료. 자체 system (UWKORINFO0201 board path).
//
// URL:
//   list:   /UWKORINFO0201/
//   상세:   /UWKORINFO0201/{N}/?curPage=1
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.uiwang.go.kr";
const LIST_URL = "https://www.uiwang.go.kr/UWKORINFO0201/";

const LIST_ITEM_REGEX =
  /<a\s+href="\/UWKORINFO0201\/(\d+)\/[^"]*"\s+class="tit">\s*([\s\S]{0,500}?)<\/a>[\s\S]{0,200}?<td>(\d{4}-\d{2}-\d{2})<\/td>/g;

// 본문 컨테이너 div.txtWrap.
// 2026-06-02 fix — 구 regex 는 첫 `</div>` 종료(non-greedy)라, txtWrap 안에 중첩 div 가
// 생기면 조기 종료 → thin → skip (6/2 cron fetched 10·inserted 0). div 깊이 추적으로
// txtWrap 의 진짜 닫는 div 까지 캡처(중첩 div 안전, 라이브 650~1122자 검증).
const TXT_WRAP_OPEN = /<div[^>]*\bclass="[^"]*\btxtWrap\b[^"]*"[^>]*>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    // 제목 끝 "첨부파일" 라벨 strip — a.tit 안에 첨부 아이콘 텍스트가 붙어 제목에 혼입.
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    )
      .replace(/\s*첨부파일\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    items.push({
      seq,
      title,
      publishedDate: m[3],
      sourceUrl: `${BASE_URL}/UWKORINFO0201/${seq}/?curPage=1`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const open = TXT_WRAP_OPEN.exec(html);
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
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeUiwangAndInsert } = createPressCollector({
  cityName: "의왕시",
  region: "경기",
  ministry: "의왕시청",
  sourceOutlet: "의왕시청",
  sourceCode: "local-press-uiwang",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
