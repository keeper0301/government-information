// ============================================================
// 광진구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 1
// ============================================================
// eGovFrame portal/bbs 표준 (B0000002 / menuNo=200191).
// 정찰: 정적 fetch 가능. list <a><span class="tit"> 구조 + <span class="date">.
//
// URL:
//   list:   /portal/bbs/B0000002/list.do?menuNo=200191
//   상세:   /portal/bbs/B0000002/view.do?nttId={N}&menuNo=200191&pageIndex=1
//
// body: <div id="dbData" class="dbData"> 안 HWP 변환 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gwangjin.go.kr";
const LIST_URL = `${BASE_URL}/portal/bbs/B0000002/list.do?menuNo=200191`;

// list anchor: <a href="...view.do?nttId={N}..."><span class="tit">제목</span></a>
const LIST_ITEM_REGEX =
  /<a\s+href="\/portal\/bbs\/B0000002\/view\.do\?nttId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

// list date: <span class="date">YYYY-MM-DD</span> — anchor 인접 row 안에서 검색
const DATE_REGEX = /<span\s+class="date">\s*(\d{4}-\d{2}-\d{2})/;

// 본문 container: dbData id + class. 본문 끝 </div> 다음 wrap </div> 또는 btnSet 시작.
const BODY_CONTAINER_REGEX =
  /<div[^>]*id="dbData"[^>]*class="dbData"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div\s+class="btnSet")/i;

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
    // anchor 시작점 ~ +800자 slice 안에서 date 추출 (같은 row 영역)
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = DATE_REGEX.exec(slice);
    items.push({
      seq,
      title,
      publishedDate: dateMatch ? dateMatch[1] : null,
      sourceUrl: `${BASE_URL}/portal/bbs/B0000002/view.do?nttId=${seq}&menuNo=200191&pageIndex=1`,
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
  // AGENTS.md 룰: 본문 min 250 / cut 20000 일관 (factory BODY_MIN_LEN + AdSense P2)
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGwangjinAndInsert } =
  createPressCollector({
    cityName: "광진구",
    region: "서울",
    ministry: "광진구청",
    sourceOutlet: "광진구청",
    sourceCode: "local-press-gwangjin",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
