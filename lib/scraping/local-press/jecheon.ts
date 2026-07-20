// ============================================================
// 충북 제천시청 오늘의 뉴스 수집 (2026-07-20) — 충북권 확장
// ============================================================
// 공식 오늘의 뉴스: /www/selectBbsNttList.do?key=112&bbsNo=287
// 목록: media-card형 selectBbsNttView.do?...bbsNo=287&nttNo={id}
// 상세: /www/selectBbsNttView.do?key=112&bbsNo=287&nttNo={id}
// 본문: SI 공용 헬퍼(bbs_content 셀)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.jecheon.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?key=112&bbsNo=287`;

const CARD_REGEX = /<li[^>]*class="p-media"[^>]*>([\s\S]*?)<\/li>/g;
const LINK_REGEX = /selectBbsNttView\.do\?[^"']*?bbsNo=287[^"']*?nttNo=(\d+)[^"']*?["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const cardRe = new RegExp(CARD_REGEX.source, "g");
  while ((match = cardRe.exec(html)) !== null) {
    const card = match[1];
    const link = LINK_REGEX.exec(card);
    if (!link) continue;

    const seq = link[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = decodeBasicEntities(
      link[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    )
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(card);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=112&bbsNo=287&nttNo=${seq}`,
    });
  }

  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeJecheonAndInsert } =
  createPressCollector({
    cityName: "충북 제천시",
    region: "충북",
    ministry: "충북 제천시청",
    sourceOutlet: "충북 제천시청",
    sourceCode: "local-press-jecheon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
