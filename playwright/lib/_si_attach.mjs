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
import JSZip from "jszip";

// 첨부 download 링크 — SI(downloadBbsFile.do)·eGovFrame portal/bbs(fileDown.do)·부산 SI
// CMS(금정 download.geumj)·진천 board/download.do 공통.
const DOWNLOAD_REGEX =
  /href="([^"]*(?:downloadBbsFile\.do|fileDown\.do|download\.geumj|board\/download\.do)[^"]*)"/gi;

// eGovFrame/YH portal boards may expose attachments as JavaScript calls instead
// of hrefs: fn_egov_downFile('<atchFileId>','<fileSn>').
const EGOV_DOWNFILE_CALL_REGEX =
  /fn_egov_downFile\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;

// POST-only eminwon file links: goDownLoad('<user_file_nm>','<sys_file_nm>','<file_path>').
const EMINWON_GODOWNLOAD_CALL_REGEX =
  /goDownLoad\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;

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

function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cleanHwpxXml(xml) {
  return decodeXmlEntities(
    xml
      .replace(/<hp:br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export async function extractHwpxBody(buf) {
  const zip = await JSZip.loadAsync(Buffer.from(buf));
  const names = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const chunks = [];
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const text = cleanHwpxXml(xml);
    if (text) chunks.push(text);
  }
  const body = chunks.join(" ").replace(/\s+/g, " ").trim();
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
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
  // HWPX (OOXML-like zip, PK magic). 인천 서구 첨부가 hwp → hwpx 로 바뀌며
  // 기존 HWP5(OLE) 파서가 null 을 반환해 fetched=10/skipped=10 insert-stop 이 발생했다.
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return extractHwpxBody(buf);
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

export function parseEgovDownFileUrls(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const urls = [];
  const seen = new Set();
  let match;
  const re = new RegExp(EGOV_DOWNFILE_CALL_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const [, atchFileId, fileSn] = match;
    const url = `${origin}/cmm/fms/FileDown.do?atchFileId=${encodeURIComponent(
      atchFileId,
    )}&fileSn=${encodeURIComponent(fileSn)}`;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

export async function fetchEgovDownFileAttachBody(html, baseUrl, fetchBin) {
  for (const url of parseEgovDownFileUrls(html, baseUrl)) {
    try {
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

export function parseEminwonGoDownloadForms(html) {
  const forms = [];
  const seen = new Set();
  let match;
  const re = new RegExp(EMINWON_GODOWNLOAD_CALL_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const [, userFileName, systemFileName, filePath] = match;
    const key = `${userFileName}\n${systemFileName}\n${filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push({ userFileName, systemFileName, filePath });
  }

  return forms;
}

export async function fetchEminwonGoDownloadAttachBody(html, endpoint, fetchBin) {
  for (const form of parseEminwonGoDownloadForms(html)) {
    try {
      const body = new URLSearchParams({
        user_file_nm: form.userFileName,
        sys_file_nm: form.systemFileName,
        file_path: form.filePath,
      });
      const buf = await fetchBin(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
      });
      if (!buf) continue;
      const attachBody = await extractAttachBody(buf);
      if (attachBody) return attachBody;
    } catch {
      continue;
    }
  }
  return null;
}
