// ============================================================
// SI(eGovFrame selectBbsNttView) 자치구 첨부 본문 추출 — GHA runner 포팅 (2026-06-08)
// ============================================================
// lib/scraping/local-press/_si_attach_helper.ts 의 .mjs 포팅.
// 성동 등 SI 자치구는 웹 본문 셀에 "첨부 확인" 요약 100~155자만 두고 전문은 첨부
// (PDF 또는 hwp5)에만 둔다. 이 사이트가 해외 IP 차단(ASN)이라 Vercel cron 0건 →
// GHA+icn1 프록시 경로로 첨부를 한국 IP 로 받아 전문 추출.
//
// fetch 는 주입형(fetchBin) — GHA 는 icn1 프록시 경유 바이너리, 로컬은 직접 fetch.
// ============================================================

import { extractText, getDocumentProxy } from "unpdf";
import { toMarkdown } from "@ohah/hwpjs";

// 첨부 download 링크 — SI(downloadBbsFile.do)·eGovFrame portal/bbs(fileDown.do) 공통.
const DOWNLOAD_REGEX = /href="([^"]*(?:downloadBbsFile|fileDown)\.do[^"]*)"/gi;

// PDF 전문 머리의 보도자료 표준 메타를 "총 매수 N쪽" 마커 기준으로 cut.
export function stripSiPdfMeta(text) {
  const t = text.replace(/\s+/g, " ").trim();
  const m = /총\s*매수\s*\d+\s*쪽/.exec(t);
  if (m) {
    const after = t.slice(m.index + m[0].length).trim();
    if (/[가-힣]/.test(after) && after.length >= 250) return after;
  }
  return t;
}

// hwp → markdown 결과를 평문으로. 이미지·마크업·표행·선두 버전 잡음 제거.
function cleanHwpMarkdown(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/`{1,3}/g, "")
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*\|[^\n]*\|\s*$/gm, "")
    .replace(/^\s*\|?-{2,}.*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^버전:\s*[\d.]+\s*/, "");
}

// 첨부 버퍼 → PDF(unpdf)/hwp5(@ohah) 전문. 250+ 한글이면 반환.
async function extractAttachBody(buf) {
  // PDF (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const body = stripSiPdfMeta(text);
    return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
  }
  // HWP5 (OLE 매직 D0CF)
  if (buf[0] === 0xd0 && buf[1] === 0xcf) {
    const { markdown } = toMarkdown(Buffer.from(buf), { image: "base64", useHtml: false });
    const body = cleanHwpMarkdown(markdown).replace(/\s+/g, " ").trim();
    return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
  }
  return null;
}

// 첨부(downloadBbsFile.do/fileDown.do) 순회 → PDF/hwp 전문. 첫 성공 반환.
// fetchBin(url) → Uint8Array | null (프록시 or 직접 주입).
export async function fetchSiAttachBody(html, baseDir, fetchBin) {
  const paths = [
    ...new Set(
      [...html.matchAll(DOWNLOAD_REGEX)].map((m) =>
        m[1].replace(/\s+/g, "").replace(/&amp;/g, "&"),
      ),
    ),
  ];
  for (const path of paths) {
    try {
      const url = new URL(path, baseDir).href;
      const buf = await fetchBin(url);
      if (!buf) continue;
      const body = await extractAttachBody(buf);
      if (body) return body;
    } catch {
      continue;
    }
  }
  return null;
}
