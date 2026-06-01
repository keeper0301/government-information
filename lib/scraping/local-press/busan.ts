// ============================================================
// 부산광역시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// CMS: /nbtnewsBU/{seq} 직접 link 패턴 (가장 단순).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://www.busan.go.kr/nbtnewsBU";
const DETAIL_BASE = "https://www.busan.go.kr/nbtnewsBU/";

// 2026-05-26 fix: inner content 가 nested HTML (span/i/img) 으로 625~1038 char.
// 이전 `[^<]{8,}` 은 nested tag 시 매칭 0 → list 0건 silent fail.
// lazy + 2000 limit + parseListPage 의 tag strip 으로 정확 추출.
const LIST_ITEM_REGEX =
  /<a\s+href="\/nbtnewsBU\/(\d+)[^"]*"[^>]*>([\s\S]{0,2000}?)<\/a>/g;

// 날짜: YYYY-MM-DD 별도 위치
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue; // 같은 seq 중복 link 무시
    // nested tag 제거 + decode
    const title = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    seen.add(seq);
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 2026-06-02 fix — 본문은 boardView 의 `<dt>부제목</dt><dd>...◈ 개조식 본문...</dd>` 에 존재.
// (라벨은 "부제목"이나 실제 웹 본문. 전문은 첨부 HWP.) 구 파서는 `<p>([^<]{20,})</p>`(중첩
// 태그 없는 순수 p)만 잡아 본문 대부분 누락 → 65자 thin junk 수집이었음.
// 같은 form-data-info dl 의 부서명/전화번호/작성자 메타는 dt 라벨로 구분되어 누출 0.
const BODY_DD_REGEX =
  /<dt>\s*<span>\s*부제목\s*<\/span>\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i;

export function parseDetailBody(html: string): string | null {
  const m = BODY_DD_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeBusanAndInsert } = createPressCollector({
  cityName: "부산광역시",
  region: "부산",
  ministry: "부산광역시청",
  sourceOutlet: "부산광역시청",
  sourceCode: "local-press-busan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
