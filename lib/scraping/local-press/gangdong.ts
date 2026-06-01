// ============================================================
// 강동구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 46만. newportal CMS (UTF-8 정적). www.gangdong.go.kr.
// 메인(/)은 meta refresh 로 /newportal/ 이동 → 보도자료 list 는 직접 접근 가능.
//
// list: /web/newportal/press/list, 항목 <a href="...press/{id}">제목</a> + 작성일 td.
// 상세: /web/newportal/press/{id} (GET).
// 본문: input-table 안 <td colspan="4"> 셀 (메타 표의 본문 행, td 깊이 추적).
//   (메타 td 는 colspan 3 이하라 colspan="4" 가 본문 셀과 구분됨)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gangdong.go.kr";
const LIST_URL = `${BASE_URL}/web/newportal/press/list`;

// 항목 href (절대/상대 모두 허용): /web/newportal/press/{id}
const LIST_ITEM_REGEX =
  /<a[^>]*href="(?:https:\/\/www\.gangdong\.go\.kr)?\/web\/newportal\/press\/(\d+)"[^>]*>([\s\S]{0,150}?)<\/a>/g;

const DATE_REGEX = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;

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
    // 날짜 탐색을 anchor 뒤부터 — 제목 속 날짜 오인 방지 (날짜는 같은 row 의 td).
    const afterAnchor = m.index + m[0].length;
    const slice = html.slice(afterAnchor, afterAnchor + 800);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/web/newportal/press/${seq}`,
    });
  }
  return items;
}

// 본문: input-table 안 <td colspan="4"> (본문 행). td 깊이 추적으로 중첩 table 안전.
const INPUT_TABLE_MARKER = /class="input-table/i;
const BODY_TD_OPEN = /<td[^>]*\bcolspan="4"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const ti = html.search(INPUT_TABLE_MARKER);
  if (ti < 0) return null;
  const after = html.slice(ti);
  const open = BODY_TD_OPEN.exec(after);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)td\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(after)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = after.slice(start, m.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null;

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

export const { scrapeAndInsert: scrapeGangdongAndInsert } = createPressCollector(
  {
    cityName: "강동구",
    region: "서울",
    ministry: "강동구청",
    sourceOutlet: "강동구청",
    sourceCode: "local-press-gangdong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
