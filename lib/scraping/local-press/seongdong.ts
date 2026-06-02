// ============================================================
// 성동구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 28만. SI 표준 selectBbsNttList (송파·군포 동일 CMS).
// 도메인 www.sd.go.kr, path /main/. bbsNo=188, key=1477.
//
// URL:
//   list:   /main/selectBbsNttList.do?bbsNo=188&key=1477
//   상세:   /main/selectBbsNttView.do?bbsNo=188&nttNo=N&key=1477
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";
import { extractText, getDocumentProxy } from "unpdf";

const BASE_URL = "https://www.sd.go.kr";
const LIST_URL = `${BASE_URL}/main/selectBbsNttList.do?bbsNo=188&key=1477`;

// SI 표준 — query 순서 무관 lookahead(bbsNo 일치) + nttNo 캡처.
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=188)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

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
    )
      .replace(/\s*\bNEW\s*$/, "") // 새 글 배지 strip (\b 로 RENEW 보호, \s* 로 배지 뒤 공백 허용)
      .replace(/새글$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1].replace(/\./g, "-") : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/main/selectBbsNttView.do?bbsNo=188&nttNo=${seq}&key=1477`,
    });
  }
  return items;
}

// 2026-06-02 — 성동 본문 전문은 첨부 PDF 에만(웹 셀은 "자세한 내용은 첨부를 확인하시기
// 바랍니다" 요약 89자뿐). 첨부 PDF(downloadBbsFile.do) 를 unpdf 로 추출 → 전문 900자+ 보강.
// 부산 PDF 패턴(busan.ts) 재사용. PDF 실패/부재 시 SI 공용 헬퍼(요약) fallback → factory 250
// 으로 thin skip. (동대문·성북은 같은 SI 첨부형이나 첨부 다운로드가 에러페이지 → 별도 진단 대기)
const SI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// SI 첨부 download 링크 — href 안에 개행/탭 들여쓰기가 섞여 \s 제거 + &amp; 디코드 필요.
const DOWNLOAD_REGEX = /href="([^"]*downloadBbsFile\.do[^"]*)"/gi;

// PDF 전문 머리의 보도자료 표준 메타(자료제공 일시·담당부서·전화·"사진 있음/없음·총 매수 N쪽")
// 를 "총 매수 N쪽" 마커 기준으로 cut. 마커 부재 시 전체 유지(전문 확보 우선).
export function stripSiPdfMeta(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = /총\s*매수\s*\d+\s*쪽/.exec(t);
  if (m) {
    const after = t.slice(m.index + m[0].length).trim();
    if (/[가-힣]/.test(after) && after.length >= 250) return after;
  }
  return t;
}

async function fetchPdfBody(html: string): Promise<string | null> {
  // 첨부가 여러 개(hwp+pdf)라 순회하며 %PDF 매직인 것만 파싱(hwp·HTML 에러페이지는 skip).
  const paths = [
    ...new Set(
      [...html.matchAll(DOWNLOAD_REGEX)].map((m) =>
        m[1].replace(/\s+/g, "").replace(/&amp;/g, "&"),
      ),
    ),
  ];
  for (const path of paths) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { "User-Agent": SI_UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (
        buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46
      ) {
        continue; // %PDF 아님
      }
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: true });
      const body = stripSiPdfMeta(text);
      if (/[가-힣]/.test(body) && body.length >= 250) return body.slice(0, 20000);
    } catch {
      continue;
    }
  }
  return null;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  // 1) 첨부 PDF 전문 우선 (성동 본문은 PDF 에 — 웹 셀은 요약뿐)
  const pdfBody = await fetchPdfBody(html);
  if (pdfBody) return pdfBody;
  // 2) fallback: SI 공용 헬퍼(요약). 250 미만이면 factory(BODY_MIN_LEN)가 skip.
  return parseSiNttBody(html);
}

export const { scrapeAndInsert: scrapeSeongdongAndInsert } =
  createPressCollector({
    cityName: "성동구",
    region: "서울",
    ministry: "성동구청",
    sourceOutlet: "성동구청",
    sourceCode: "local-press-seongdong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
