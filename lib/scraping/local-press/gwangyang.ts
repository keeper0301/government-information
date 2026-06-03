// ============================================================
// 광양시청 보도자료 수집 (2026-05-22) — 전남 batch
// ============================================================
// 광양시 인구 14만. board.es CMS (mid=a11007000000&bid=0057).
// 27,607+ 보도자료. 사장님 거주지 (전남) 인접.
//
// URL:
//   list:   /board.es?mid=a11007000000&bid=0057
//   상세:   /board.es?mid=a11007000000&bid=0057&act=view&list_no=N
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://gwangyang.go.kr";
const LIST_URL =
  "https://gwangyang.go.kr/board.es?mid=a11007000000&bid=0057";

// title 은 a 안 nested span (새글) 다음 텍스트. 0,500 limit + tag strip.
const LIST_ITEM_REGEX =
  /<a[^>]*href="\/board\.es\?mid=a11007000000&(?:amp;)?bid=0057&(?:amp;)?act=view&(?:amp;)?list_no=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

// 본문은 board.es view 테이블의 <td colspan="4" class="view_content"> 셀.
// class 앞에 colspan 등 속성이 먼저 오고 (그래서 <td class= 로는 매칭 안 됨),
// 본문 안에 HWP/워드 export 중첩 table 이 섞여 있어 </td> 경계가 깨진다.
// → 첨부파일 행(view_file)·버튼영역 마커까지 non-greedy 로 잘라 중첩 table 영향 제거.
const BODY_CONTAINER_REGEX =
  /class="[^"]*view_content[^"]*"[^>]*>([\s\S]*?)(?:<td[^>]*class="[^"]*view_file|<th[^>]*>\s*첨부파일|<div\s+class="btnArea|<!--버튼영역-->)/i;

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
      m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    )
      // 2026-06-03 — span.new "새글" 배지 텍스트가 제목 앞에 붙던 것 제거.
      .replace(/^\s*새글\s*/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/board.es?mid=a11007000000&bid=0057&act=view&list_no=${seq}`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      // MS Word/HWP export 조건부 주석 (<!--[if ...]-->) 제거
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    // 캡처 끝에 딸려오는 구조 라벨(첨부파일) 제거
    .replace(/\s*첨부파일\s*$/, "")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeGwangyangAndInsert } =
  createPressCollector({
    cityName: "광양시",
    region: "전남",
    ministry: "광양시청",
    sourceOutlet: "광양시청",
    sourceCode: "local-press-gwangyang",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
