// ============================================================
// 강남구청 보도자료 수집 (2026-05-22) — 광역시 자치구 확장 첫 시범
// ============================================================
// 광역시 자치구 정적 fetch 가능 site 발견. 인구 56만, 사이트 활발 (총 5299건+).
//
// URL:
//   list:  /board/B_000031/list.do?mid=ID01_031
//   상세:  /board/B_000031/{id}/view.do?mid=ID01_031
//
// body: hwp_editor_board_content 안 hwp 변환 본문.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";

const BASE_URL = "https://www.gangnam.go.kr";
const LIST_URL =
  "https://www.gangnam.go.kr/board/B_000031/list.do?mid=ID01_031";

// list anchor: <a href="/board/B_000031/{id}/view.do?mid=ID01_031">{title}</a>
const LIST_ITEM_REGEX =
  /<a\s+href="\/board\/B_000031\/(\d+)\/view\.do\?[^"]*"[^>]*>\s*([\s\S]*?)<\/a>/g;

// 작성일 td — list 의 마지막 column
const DATE_REGEX = /<td>(\d{4}-\d{2}-\d{2})<\/td>/g;

// 본문 — hwp_editor_board_content
const BODY_CONTAINER_REGEX =
  /<div\s+class="hwp_editor_board_content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;

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
    // 각 link 다음 800자 안에서 date 찾기 (row 같은 td)
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    items.push({
      seq,
      title,
      publishedDate: dateMatch ? dateMatch[1] : null,
      sourceUrl: `${BASE_URL}/board/B_000031/${seq}/view.do?mid=ID01_031`,
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
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

// 추후 source_id / category / slug 자동 가드는 _factory 가 처리.
// 다만 makeNewsSourceId / makeNewsSlug import 는 미래 직접 insert 대비 (현재 사용 X).
void makeNewsSourceId;
void makeNewsSlug;

export const { scrapeAndInsert: scrapeGangnamAndInsert } = createPressCollector(
  {
    cityName: "강남구",
    region: "서울",
    ministry: "강남구청",
    sourceOutlet: "강남구청",
    sourceCode: "local-press-gangnam",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
