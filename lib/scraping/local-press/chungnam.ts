// ============================================================
// 충청남도 도청 보도자료 수집 (Phase 1 — 광역도 6번째)
// ============================================================
// 인구 213만. CMS: cnportal 자체 (cnapcPress board).
//   - list link: <a href="/cnportal/cnapcPressList/cnapcPress/view.do?nttId=N..." class="tit">제목</a>
//   - 본문: detail page 컨테이너
// ============================================================

import { load } from "cheerio";

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chungnam.go.kr";
const LIST_URL =
  "https://www.chungnam.go.kr/cnportal/cnapcPressList/cnapcPress/list.do?menuNo=500498";

// 2026-05-22 fix — site 가 board-view + content_body 새 class 사용.
// 기존 bbs_view 등 매칭 0. 새 class + legacy fallback.
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:board-view|content_body|content_ar)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="board-view-li\s+item|<\/article|<\/section)/i;
const BODY_CONTAINER_REGEX_LEGACY =
  /<(?:div|td)\s+(?:class|id)="(?:bbs_view|content|board_view|view_content|tbl_view)"[^>]*>([\s\S]*?)<\/(?:div|td)>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html);
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  $("a.tit[href*=\"cnapcPress/view.do\"]").each((_, element) => {
    const link = $(element);
    const href = link.attr("href") ?? "";
    const seq = /[?&]nttId=(\d+)/.exec(href)?.[1];
    const title = link.text().replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || title.length < 5) return;
    // 글이 속한 표의 행에서만 날짜를 읽습니다. 속성 순서와 제목 속성 추가에 영향받지 않습니다.
    const date = /(20\d{2}-\d{2}-\d{2})/.exec(link.closest("tr").text())?.[1] ?? null;
    seen.add(seq);
    items.push({ seq, title, publishedDate: date, sourceUrl: new URL(href, BASE_URL).href });
  });
  return items;
}

export function parseDetailBody(html: string): string | null {
  const $ = load(html);
  const modern = $(".board-view .board-view-li").last().find(".board-view-inner").clone();
  modern.find("script, style").remove();
  const modernText = modern.text().replace(/\s+/g, " ").trim();
  if (modernText.length >= 250 && /[가-힣]/.test(modernText)) return modernText.slice(0, 20000);
  const m = BODY_CONTAINER_REGEX.exec(html) ?? BODY_CONTAINER_REGEX_LEGACY.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeChungnamAndInsert } = createPressCollector({
  cityName: "충청남도",
  region: "충남",
  ministry: "충청남도청",
  sourceOutlet: "충청남도청",
  sourceCode: "local-press-chungnam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
