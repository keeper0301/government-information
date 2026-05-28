// ============================================================
// 부산진구청 보도자료 수집 (2026-05-25) — 부산 자치구 batch
// ============================================================
// 부산진구 인구 35만. 자체 CMS (`/board/list.busanjin?boardId=BBS_0000265`).
//
// URL:
//   list:   /board/list.busanjin?boardId=BBS_0000265&menuCd=DOM_000000103007004000
//   상세:   /board/view.busanjin?boardId=BBS_0000265&menuCd=...&dataSid={N}
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.busanjin.go.kr";
const LIST_URL =
  "https://www.busanjin.go.kr/board/list.busanjin?boardId=BBS_0000265&menuCd=DOM_000000103007004000";

const LIST_ITEM_REGEX =
  /<a[^>]*href="(\/board\/view\.busanjin\?[^"]*boardId=BBS_0000265[^"]*dataSid=(\d+)[^"]*)"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2}|\d{2}\.\d{2}\.\d{2})/g;

// 부산진 상세 본문은 <div class="view01"> 안의 <div class="substan"> 셀.
// (view01 전체를 잡으면 이전글/다음글 제목까지 본문에 섞이는 사고 → substan 으로 좁힘)
// 끝 경계: 본문에 절대 안 나오는 구조 마커(버튼/네비/첨부 섹션 class·goList·이전/다음글
// 섹션 주석)의 여는 '<' 직전까지. 텍스트 마커(>첨부 등)는 본문 링크·이미지 alt 에서
// 오발해 본문이 잘릴 수 있어 쓰지 않음 (code review).
const BODY_CONTAINER_REGEX =
  /<div\s+class="substan"[^>]*>([\s\S]*?)(?:<[a-z][^>]*class="[^"]*(?:board-btns|boardbtn|btnArea|btn_list|view_list|add_file|view_file)|<(?:ul|div|p)[^>]*class="[^"]*\bfile\b|<[a-z][^>]*onclick="goList|<!--\s*s\s*:\s*이전)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    let publishedDate: string | null = null;
    if (dateMatch) {
      const raw = dateMatch[1].replace(/\./g, "-");
      // 2026-05-25 review fix: length 8 hard 가정 X. 첫 segment 가 2 자리면 20 prefix.
      // 25-5-15 (한자리 월) 같은 비표준 형식도 안전 처리.
      publishedDate = /^\d{2}-/.test(raw) ? `20${raw}` : raw;
    }
    // href 안의 HTML entity `&amp;` decode — 안 하면 detail URL 이 깨져 fetch 가
    // 에러 페이지(1.5KB)를 받아 본문 0건이 된다 (geumjeong 과 동일 처리).
    const path = m[1].replace(/&amp;/g, "&");
    const fullUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: fullUrl,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      .replace(/<!--[\s\S]*?-->/g, " ") // MS Word/HWP export 조건부 주석 제거
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/<[^>]*$/, ""), // 끝에 남는 미완성 여는 태그 조각 제거
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeBusanjinAndInsert } = createPressCollector(
  {
    cityName: "부산진구",
    region: "부산",
    ministry: "부산진구청",
    sourceOutlet: "부산진구청",
    sourceCode: "local-press-busanjin",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
