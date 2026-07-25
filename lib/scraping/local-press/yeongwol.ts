// ============================================================
// 강원특별자치도 영월군청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /www/selectBbsNttList.do?bbsNo=19&key=21
// 목록: SI legacy bbs_default list table
// 상세: bbs_content는 요약형, HWP 첨부가 전문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.yw.go.kr";
const BBS_NO = "19";
const KEY = "21";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=${BBS_NO}&key=${KEY}`;
const DETAIL_BASE = `${BASE_URL}/www/`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /selectBbsNttView\.do(?:;[^?"']*)?\?[^"']*?bbsNo=19[^"']*?nttNo=(\d+)[^"']*?["']/i;
const TITLE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\bsubject\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i;
const DATE_REGEX = /\b(\d{4})[.\-](\d{2})[.\-](\d{2})\b/;
const SYNAP_PREVIEW_REGEX = /href=["']([^"']*\/common\/program\/synap\.jsp\?[^"']+)["']/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bbbs_ico\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#40;|&lpar;/g, "(")
      .replace(/&#41;|&rpar;/g, ")")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/www/selectBbsNttView.do?key=${KEY}&bbsNo=${BBS_NO}&nttNo=${seq}&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=&pageUnit=10`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "g");
  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    if (!linkMatch) continue;

    const seq = linkMatch[1];
    if (seen.has(seq)) continue;

    const title = stripHtml(TITLE_REGEX.exec(rowHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(rowHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: makeDetailUrl(seq),
    });
  }

  return items;
}

function parseSynapPreviewUrl(html: string): string | null {
  const raw = SYNAP_PREVIEW_REGEX.exec(html)?.[1];
  if (!raw) return null;
  return new URL(raw.replace(/&amp;/g, "&"), BASE_URL).href;
}

function parseXmlValue(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i").exec(
    xml,
  );
  return match?.[1]?.trim() ?? null;
}

function cleanSynapHtml(html: string): string {
  return stripHtml(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n"),
  )
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSynapPreviewBody(html: string): Promise<string | null> {
  const previewUrl = parseSynapPreviewUrl(html);
  if (!previewUrl) return null;

  try {
    const previewRes = await fetch(previewUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!previewRes.ok) return null;
    const finalUrl = previewRes.url;
    const final = new URL(finalUrl);
    const fileName = final.searchParams.get("fn");
    const rs = final.searchParams.get("rs");
    if (!fileName || !rs) return null;

    const resultDir = new URL(rs.endsWith("/") ? rs : `${rs}/`, BASE_URL).href;
    const xmlUrl = new URL(`${fileName}.xml`, resultDir).href;
    const xmlRes = await fetch(xmlUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!xmlRes.ok) return null;
    const xml = await xmlRes.text();
    const pageCount = Math.min(
      Math.max(Number(parseXmlValue(xml, "filespage_cnt") ?? "0"), 0),
      20,
    );
    if (pageCount === 0) return null;

    const parts: string[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const pageUrl = new URL(`${fileName}.files/${page}.xhtml`, resultDir).href;
      const pageRes = await fetch(pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!pageRes.ok) continue;
      parts.push(cleanSynapHtml(await pageRes.text()));
    }
    const body = parts.join(" ").replace(/\s+/g, " ").trim();
    return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
  } catch {
    return null;
  }
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attachmentOrBody = await parseSiAttachOrBody(html, DETAIL_BASE);
  if (attachmentOrBody) return attachmentOrBody;
  return fetchSynapPreviewBody(html);
}

export const { scrapeAndInsert: scrapeYeongwolAndInsert } = createPressCollector({
  cityName: "영월군",
  region: "강원",
  ministry: "강원특별자치도 영월군청",
  sourceOutlet: "강원특별자치도 영월군청",
  sourceCode: "local-press-yeongwol",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
