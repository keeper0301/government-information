// ============================================================
// 전남 담양군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /board/list?domainId=DOM_0000001&boardId=BBS_0000007...
// 목록/상세: 담양군 동적 게시판 JSON API
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.damyang.go.kr";
const BOARD_ID = "BBS_0000007";
const DOMAIN_ID = "DOM_0000001";
const CONTENTS_SID = "12";
const MENU_CD = "DOM_000000190001005001";
const LIST_PAGE_URL = `${BASE_URL}/board/list?domainId=${DOMAIN_ID}&boardId=${BOARD_ID}&contentsSid=${CONTENTS_SID}&menuCd=${MENU_CD}`;
const LIST_URL = `${BASE_URL}/board/getContentsList?domainId=${DOMAIN_ID}&boardId=${BOARD_ID}&orderCondition=REGISTER_DATE%20DESC&searchCondition=DATA_TITLE&searchKeyword=&getOfficeNm=true&ROW_CNT=10&BEGIN_ROW_IDX=1&CUR_PAGE_IDX=1`;

type DamyangListItem = {
  dataSid?: number | string;
  dataTitle?: string;
  registerDate?: string;
  regDate?: string;
};

type DamyangDetail = {
  dataTitle?: string;
  dataContent?: string;
  regDate?: string;
  registerDate?: string;
};

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|\b새글\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDate(value?: string): string | null {
  const match = value?.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function getListItems(payload: unknown): DamyangListItem[] {
  const data = payload as {
    RSLT_DATA?: { boardContentsList?: DamyangListItem[] };
  };
  return data.RSLT_DATA?.boardContentsList ?? [];
}

function getDetail(payload: unknown): DamyangDetail | null {
  const data = payload as {
    RSLT_DATA?: {
      boardDetail?: {
        boardContentsDetail?: DamyangDetail;
      };
    };
  };
  return data.RSLT_DATA?.boardDetail?.boardContentsDetail ?? null;
}

function detailApiUrl(seq: string): string {
  return `${BASE_URL}/board/getBoardDetail?dataSid=${seq}&boardId=${BOARD_ID}&getOfficeNm=true`;
}

export function parseListPage(jsonText: string): PressNewsItem[] {
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const items: PressNewsItem[] = [];

  for (const item of getListItems(payload)) {
    const seq = String(item.dataSid ?? "").trim();
    if (!seq || seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(item.dataTitle ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: normalizeDate(item.registerDate ?? item.regDate),
      sourceUrl: detailApiUrl(seq),
    });
  }

  return items;
}

export function parseDetailBody(jsonText: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return null;
  }

  const detail = getDetail(payload);
  if (!detail) return null;

  const title = stripHtml(detail.dataTitle ?? "");
  const datePrefix = normalizeDate(detail.regDate ?? detail.registerDate) ?? "";
  const body = stripHtml(detail.dataContent ?? "");
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeDamyangAndInsert } = createPressCollector({
  cityName: "전남 담양군",
  region: "전남",
  ministry: "전남 담양군청",
  sourceOutlet: "전남 담양군청",
  sourceCode: "local-press-damyang",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});

export const officialDamyangPressListUrl = LIST_PAGE_URL;
