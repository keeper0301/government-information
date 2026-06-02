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
import { extractText, getDocumentProxy } from "unpdf";

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

// 2026-06-02 — 부산 본문 전문은 첨부 PDF 에만 존재(웹 dd 는 ◈ 요약뿐, 250 미만 thin).
// 첨부 PDF(/comm/getFile?...fileTy=ATTACH) 를 unpdf 로 추출 → 전문(3000자+) 보강.
// PDF 실패/부재 시 부제목 dd(요약) fallback (factory 250 으로 thin skip).
const BUSAN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PDF_ATTACH_REGEX = /href="(\/comm\/getFile\?[^"]*fileTy=ATTACH[^"]*)"/i;

// PDF 전문에서 보도자료 표준 메타 머리(담당부서·전화·유형·공개여부·"※…표시")를 가능하면
// 제거. PDF 텍스트 레이아웃이 불규칙해 실패 시 전체 유지(전문 확보 우선).
export function stripPdfMeta(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  // 보도자료 표준 안내문 "각종 회의·행사 등에 한해서 표시"가 메타 머리(날짜·담당부서·유형·
  // 공개여부)의 끝 마커. ※ 기호 위치는 PDF 레이아웃 따라 앞/뒤로 뒤집혀 가변이라 ※ 대신
  // 이 문구를 기준으로 cut. 마커 부재 시 전체 유지(전문 확보 우선).
  const m = /각종\s*회의[\s\S]{0,25}?표시[,.]?\s*※?\s*/.exec(t);
  if (m) {
    const after = t.slice(m.index + m[0].length).trim();
    if (/[가-힣]/.test(after) && after.length >= 250) return after;
  }
  return t;
}

async function fetchPdfBody(html: string): Promise<string | null> {
  const m = PDF_ATTACH_REGEX.exec(html);
  if (!m) return null;
  const pdfUrl = `https://www.busan.go.kr${m[1].replace(/&amp;/g, "&")}`;
  try {
    const res = await fetch(pdfUrl, {
      headers: { "User-Agent": BUSAN_UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // PDF 매직(%PDF) 확인 — getFile 이 HTML 에러페이지 반환 시 방어.
    if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
      return null;
    }
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const body = stripPdfMeta(text);
    return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
  } catch {
    return null;
  }
}

export async function parseDetailBody(html: string): Promise<string | null> {
  // 1) 첨부 PDF 전문 우선 (부산 본문은 PDF 에만 — 웹은 요약뿐)
  const pdfBody = await fetchPdfBody(html);
  if (pdfBody) return pdfBody;

  // 2) fallback: 부제목 dd(웹 요약). 250 미만이면 factory(BODY_MIN_LEN)가 skip.
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
