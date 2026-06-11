// ============================================================
// 충주시청 보도자료 수집 (2026-05-22)
// ============================================================
// 충주시 인구 21만. SI 표준 selectBbsNttList. 30,226+ 보도자료.
// a 안 nested content (photo div) 크기 위해 limit ↑.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";
import { nextDifferentIdIndex } from "./_date_window";

const BASE_URL = "https://www.chungju.go.kr";
const LIST_URL =
  "https://www.chungju.go.kr/www/selectBbsNttList.do?bbsNo=6&key=494";

// limit 2000 (nested photo div 큼)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=6)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,2000}?)<\/a>/g;

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
    // anchor inner(substance) 에는 제목 <strong class="subject"> + 부제목·담당부서·본문
    // <span class="text"> 가 함께 들어있다. 통째 태그제거 시 "제목 - 부제목 - (부서) 본문…"
    // 으로 junk 가 섞이므로, subject 블록 안만 제목으로 추출(없으면 기존 통째 fallback).
    const subjectMatch =
      /<strong[^>]*class="[^"]*\bsubject\b[^"]*"[^>]*>([\s\S]*?)<\/strong>/i.exec(
        m[2],
      );
    const rawTitle = subjectMatch ? subjectMatch[1] : m[2];
    const title = decodeBasicEntities(
      rawTitle.replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // 윈도우 끝을 '다음 글(다른 nttNo)' 직전으로 제한 — 행 간격 좁을 때 옆 글 날짜
    // 오취득 방지(_date_window). 다음 글 없으면 기존 2500 유지(엄격히 비회귀).
    const boundary = nextDifferentIdIndex(html, m.index, "nttNo", seq);
    const end =
      boundary >= 0 ? Math.min(boundary, m.index + 2500) : m.index + 2500;
    const slice = html.slice(m.index, end);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=6&nttNo=${seq}&key=494`,
    });
  }
  return items;
}

// 본문 파싱은 SI selectBbsNttView 공용 헬퍼 사용 (p-table__content/bbs_content 셀).
export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeChungjuAndInsert } = createPressCollector(
  {
    cityName: "충주시",
    region: "충북",
    ministry: "충주시청",
    sourceOutlet: "충주시청",
    sourceCode: "local-press-chungju",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
