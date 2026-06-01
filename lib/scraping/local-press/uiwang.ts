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

// 2026-06-01 — 본문 컨테이너 교정. 기존 bbs-view 는 제목·작성자·작성일·조회수
// 메타 테이블까지 잡아 본문 대신 "보도자료 상세 - 제목, 작성자..." 가 저장되던 버그.
// 실제 본문은 div.txtWrap (라이브 검증: 단순 <p>/<span> 구조라 첫 </div> 가 정확한
// 본문 끝, 696자 완결). cron 결과 검증(6/1)에서 발견.
const BODY_CONTAINER_REGEX =
  /<div\s+class="txtWrap[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

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
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
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
