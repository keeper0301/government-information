// ============================================================
// 서울 중구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 12만. 자체 CMS (content.do?cmsid), UTF-8 정적. www.junggu.seoul.kr.
// 메인(/)은 빈 shell → /main.do 가 실제. 보도자료 게시판 cmsid=14390.
// ⚠️ 인천 중구(junggu_incheon, icjg.go.kr)와 별개. key=junggu_seoul.
//
// list: <a href="/content.do?cmsid=14390&mode=view&cid={N}">제목</a> + 같은 row 작성일.
// 상세: 같은 content.do?cmsid=14390&mode=view&cid={N} (GET).
// 본문: <td class="view_txt"> 셀 (메타 표의 "내용" 행, td 깊이 추적).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.junggu.seoul.kr";
const LIST_URL = `${BASE_URL}/content.do?cmsid=14390`;

// list anchor: content.do?cmsid=14390&mode=view&cid={N}. &amp; 인코딩 허용.
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*content\.do\?cmsid=14390&(?:amp;)?mode=view&(?:amp;)?cid=(\d+)[^"]*"[^>]*>([\s\S]{0,150}?)<\/a>/g;

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
    // 날짜 탐색 slice 를 anchor(제목 포함) 뒤부터 시작 — 제목에 YYYY-MM-DD 가 있어도
    // 작성일 대신 제목 날짜를 잡는 오인 방지 (날짜는 list row 의 anchor 뒤 td/span).
    const afterAnchor = m.index + m[0].length;
    const slice = html.slice(afterAnchor, afterAnchor + 800);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/content.do?cmsid=14390&mode=view&cid=${seq}`,
    });
  }
  return items;
}

// 본문 <td class="view_txt"> — 메타 표("제목/분류/담당부서/보도일/조회수/내용") 의 내용 셀.
// td 깊이 추적으로 중첩 table 안전, 닫는 td 없으면 null(junk 방지).
const VIEW_TXT_OPEN = /<td[^>]*\bclass="view_txt"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = VIEW_TXT_OPEN.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)td\b[^>]*>/gi;
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

export const { scrapeAndInsert: scrapeJungguSeoulAndInsert } =
  createPressCollector({
    cityName: "서울 중구",
    region: "서울",
    ministry: "서울 중구청",
    sourceOutlet: "서울 중구청",
    sourceCode: "local-press-junggu-seoul",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
