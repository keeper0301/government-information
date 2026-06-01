// ============================================================
// 동작구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 1
// ============================================================
// eGovFrame portal/bbs 표준 (B0000171 / menuNo=200647).
// 광진과 동일 구조 (dbData 본문 + span.date).
//
// URL:
//   list:   /portal/bbs/B0000171/list.do?menuNo=200647
//   상세:   /portal/bbs/B0000171/view.do?nttId={N}&menuNo=200647&pageIndex=1
//
// body: <div id="dbData" class="dbData">
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.dongjak.go.kr";
const LIST_URL = `${BASE_URL}/portal/bbs/B0000171/list.do?menuNo=200647`;

const LIST_ITEM_REGEX =
  /<a\s+href="\/portal\/bbs\/B0000171\/view\.do\?nttId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

const DATE_REGEX = /<span\s+class="date">\s*(\d{4}-\d{2}-\d{2})/;

// 2026-06-01 fix — 동작은 광진과 달리 id="dbData" 없이 class="dbData" 만 있음.
// strict regex (id+class 둘 다 요구) 가 매칭 실패 → 5/31 fetched 10/inserted 0.
// id 가드 제거. class 만 매칭 — 광진은 id+class 모두 있어 그대로 별도 collector 유지.
const BODY_CONTAINER_REGEX =
  /<div[^>]*class="dbData"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div\s+class="btnSet")/i;

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
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = DATE_REGEX.exec(slice);
    items.push({
      seq,
      title,
      publishedDate: dateMatch ? dateMatch[1] : null,
      sourceUrl: `${BASE_URL}/portal/bbs/B0000171/view.do?nttId=${seq}&menuNo=200647&pageIndex=1`,
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
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeDongjakAndInsert } = createPressCollector(
  {
    cityName: "동작구",
    region: "서울",
    ministry: "동작구청",
    sourceOutlet: "동작구청",
    sourceCode: "local-press-dongjak",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
