// ============================================================
// 용산구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 1
// ============================================================
// eGovFrame portal/bbs 표준 (B0000043 / menuNo=200230). 광진·동작과 같은 패턴.
// 본문 class 는 소문자 'dbdata' (광진·동작은 'dbData') — case-insensitive regex 사용.
//
// URL:
//   list:   /portal/bbs/B0000043/list.do?menuNo=200230
//   상세:   /portal/bbs/B0000043/view.do?nttId={N}&menuNo=200230&pageUnit=10&pageIndex=1
//
// body: <div class="bd-view"> 안 또는 <div class="dbdata"> (case-insensitive)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yongsan.go.kr";
const LIST_URL = `${BASE_URL}/portal/bbs/B0000043/list.do?menuNo=200230`;

const LIST_ITEM_REGEX =
  /<a\s+href="\/portal\/bbs\/B0000043\/view\.do\?nttId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

const DATE_REGEX = /<span\s+class="date">\s*(\d{4}-\d{2}-\d{2})/;

// 용산은 dbdata (소문자) — case-insensitive flag i 적용.
// 광진·동작 'dbData' 와 호환 위해 i flag 만 추가.
const BODY_CONTAINER_REGEX =
  /<div[^>]*class="dbdata"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div\s+class="btnSet")/i;

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
      sourceUrl: `${BASE_URL}/portal/bbs/B0000043/view.do?nttId=${seq}&menuNo=200230&pageUnit=10&pageIndex=1`,
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

export const { scrapeAndInsert: scrapeYongsanAndInsert } = createPressCollector(
  {
    cityName: "용산구",
    region: "서울",
    ministry: "용산구청",
    sourceOutlet: "용산구청",
    sourceCode: "local-press-yongsan",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
