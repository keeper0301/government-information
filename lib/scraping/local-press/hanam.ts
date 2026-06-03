// ============================================================
// 하남시청 보도자료 수집 (2026-05-22)
// ============================================================
// 하남시 인구 32만. SI 표준 selectBbsNttList.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.hanam.go.kr";
const LIST_URL =
  "https://www.hanam.go.kr/sosik/selectBbsNttList.do?bbsNo=1164&key=10048";

// 2026-05-26 inner limit {0,500} → {0,5000} (a 안 nested 큰 thumb 가 첫 match 막음)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=1164)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,5000}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

// 2026-06-03 — 본문 컨테이너가 첨부박스(div.attach_box)·이전글/다음글 네비
// (ul.temp_board_bottom)까지 포함해 본문 끝에 "첨부파일 ...[KBytes] 이전글 X 다음글 Y
// 목록으로" junk 가 사용자 본문에 노출되던 버그 → 끝 마커에 attach_box·temp_board_bottom
// 추가해 본문 직후에서 컨테이너 캡처 종료.
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:bbs_wrap|p-table__content|bbs__view)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:p-table__bottom|btn|pagination|attach_box)|<ul\s+class="temp_board_bottom"|<\/article|<\/section)/i;

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
    // 2026-06-03 — 날짜(span.post_data)가 anchor 에서 ~880자 뒤라 800 으론 못 잡아 fallback
    // 되던 것 → 1300. DATE_REGEX 첫 매칭이라 다음 글 날짜는 안 잡음.
    const slice = html.slice(m.index, m.index + 1300);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/sosik/selectBbsNttView.do?bbsNo=1164&nttNo=${seq}&key=10048`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  // 2026-06-02 fix — 본문 컨테이너 안 <script>(fn_deleteBbsNtt 등) 블록 제거.
  // 구 코드는 <script> 태그만 지우고 JS 코드 텍스트가 본문 머리에 섞이던 버그.
  const text = decodeBasicEntities(
    m[1]
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    // 이미지 확대보기 버튼 텍스트 제거 (SI 계열 표준 UI junk — _si_ntt_helper 와 동일).
    .replace(/사진\s*확대보기/g, " ")
    // 공공누리 라이선스 푸터 제거 — 모든 정부 보도자료 표준 문구라 본문 자연어
    // 오제거 위험 없음. "본 저작물은 "공공누리" 제N유형 …" 부터 끝까지.
    // (공공누리가 본문 컨테이너 안에 포함된 경우에만 작동; 컨테이너 밖이면
    //  위 BODY_CONTAINER_REGEX 끝 마커가 이미 제외.)
    .replace(/\s*본\s*저작물은[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeHanamAndInsert } = createPressCollector({
  cityName: "하남시",
  region: "경기",
  ministry: "하남시청",
  sourceOutlet: "하남시청",
  sourceCode: "local-press-hanam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
