// ============================================================
// SI(eGovFrame selectBbsNttView) 자치구 첨부 본문 추출 공용 헬퍼 (2026-06-02)
// ============================================================
// 성동·동대문·성북 등 SI 자치구는 웹 본문 셀(p-table__content)에 "자세한 내용은 첨부를
// 확인하시기 바랍니다" 요약 65~89자만 두고, 전문은 첨부파일(PDF 또는 hwp5)에만 둔다.
// → factory BODY_MIN_LEN=250 가드로 수집 0건이었음.
//
// 이 헬퍼는 downloadBbsFile.do 첨부를 순회하며 PDF(unpdf)·hwp5(@ohah)를 전문 추출한다.
// href 가 절대경로(성동 /main/)·상대경로(동대문·성북 ./) 혼재라 new URL(path, baseDir)로
// resolve(상대 ./ 버그가 동대문·성북 다운로드 실패의 원인이었음).
// 부산(unpdf)·강원(@ohah) 패턴을 SI 그룹에 맞게 통합.
//
// ⚠️ 동기화 주의: GHA runner 용 포팅본이 `playwright/lib/_si_attach.mjs` 에 별도로 있다
//   (별도 npm 패키지·raw node 라 이 .ts 를 직접 import 불가 → 불가피한 2벌). stripSiPdfMeta·
//   cleanHwpMarkdown·extractAttachBody 로직 수정 시 양쪽 같이 고칠 것.
// ============================================================

import { toMarkdown } from "@ohah/hwpjs";
import type JSZipDefault from "jszip";
import { parseSiNttBody } from "./_si_ntt_helper";

type JSZipModule = { default: typeof JSZipDefault };

async function loadJsZip(): Promise<JSZipModule> {
  // Load lazily so normal route bundles do not pay for HWPX parsing unless a
  // zipped attachment is actually encountered.
  return import("jszip") as unknown as Promise<JSZipModule>;
}

async function loadUnpdf(): Promise<typeof import("unpdf")> {
  // Next webpack traces even `await import("unpdf")` and emits import.meta warnings.
  // Keep this dependency out of the route bundle graph; PDF parsing only runs inside
  // the Node cron collector path after a confirmed PDF attachment download.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("unpdf")>;
  return dynamicImport("unpdf");
}

const SI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 첨부 download 링크 — SI(downloadBbsFile.do)·eGovFrame portal/bbs(fileDown.do)·
// 진천 board/download.do 공통.
// href 안에 개행/탭이 섞여 \s 제거 + &amp; 디코드 필요.
const DOWNLOAD_REGEX =
  /href="([^"]*(?:downloadBbsFile|fileDown|board\/download)\.do[^"]*)"/gi;

// eGovFrame/YH portal boards may expose attachments only as JS calls instead of
// hrefs: fn_egov_downFile('<atchFileId>','<fileSn>'). The corresponding download
// endpoint is `/cmm/fms/FileDown.do` on the same origin.
const EGOV_DOWNFILE_CALL_REGEX =
  /fn_egov_downFile\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;

// Some eminwon-backed municipal pages expose attachments as POST-only JavaScript
// calls: goDownLoad('<user_file_nm>','<sys_file_nm>','<file_path>').
const EMINWON_GODOWNLOAD_CALL_REGEX =
  /goDownLoad\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;

// PDF 전문 머리의 보도자료 표준 메타(자료제공 일시·담당부서·전화·"사진 있음/없음·총 매수 N쪽")
// 를 "총 매수 N쪽" 마커 기준으로 cut. 마커 부재/cut 후 250 미만이면 전체 유지(전문 확보 우선).
export function stripSiPdfMeta(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = /총\s*매수\s*\d+\s*쪽/.exec(t);
  if (m) {
    const after = t.slice(m.index + m[0].length).trim();
    if (/[가-힣]/.test(after) && after.length >= 250) return after;
  }
  return t;
}

// hwp → markdown 결과를 평문으로 (강원 cleanHwpMarkdown 동일 로직). 이미지·마크업·표행·선두
// 버전 잡음 제거.
function cleanHwpMarkdown(md: string): string {
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

function decodeXmlEntities(s: string): string {
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

function cleanHwpxXml(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<hp:br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export async function extractHwpxBody(
  buf: Uint8Array,
): Promise<string | null> {
  const mod = await loadJsZip();
  const JSZip = mod.default;
  const zip = await JSZip.loadAsync(Buffer.from(buf));
  const names = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const chunks: string[] = [];
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

// 첨부 버퍼 → PDF(unpdf)/hwp5(@ohah) 전문. 250+ 한글이면 반환, 아니면 null(hwp·HTML 에러
// 페이지·짧은 첨부 방어).
async function extractAttachBody(buf: Uint8Array): Promise<string | null> {
  // PDF (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    // unpdf 는 내부에서 import.meta 직접 접근을 사용한다. route/module graph 에 걸면
    // Next webpack build 가 경고를 띄우므로 우회 로더로 지연 로드한다.
    const { extractText, getDocumentProxy } = await loadUnpdf();
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const body = stripSiPdfMeta(text);
    return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
  }
  // HWP5 (OLE 매직 D0CF)
  if (buf[0] === 0xd0 && buf[1] === 0xcf) {
    const { markdown } = toMarkdown(Buffer.from(buf), {
      image: "base64",
      useHtml: false,
    });
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

// 첨부(downloadBbsFile.do/fileDown.do) 순회 → PDF/hwp 전문. 첨부가 여러 개(hwp+pdf)면 전문
// 추출 성공한 첫 것 반환. href 상대(./)·절대(/main/, /portal/) 모두 baseDir 기준 resolve.
// fallback 이 collector 마다 달라(SI=parseSiNttBody, eGovFrame=dbData) export 해 직접 호출케 함.
export async function fetchSiAttachBody(
  html: string,
  baseDir: string,
): Promise<string | null> {
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
      const res = await fetch(url, {
        headers: { "User-Agent": SI_UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const body = await extractAttachBody(new Uint8Array(await res.arrayBuffer()));
      if (body) return body;
    } catch {
      continue;
    }
  }
  return null;
}

export function parseEgovDownFileUrls(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const urls: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
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

export async function fetchEgovDownFileAttachBody(
  html: string,
  baseUrl: string,
): Promise<string | null> {
  for (const url of parseEgovDownFileUrls(html, baseUrl)) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": SI_UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const body = await extractAttachBody(new Uint8Array(await res.arrayBuffer()));
      if (body) return body;
    } catch {
      continue;
    }
  }
  return null;
}

export type EminwonGoDownloadForm = {
  userFileName: string;
  systemFileName: string;
  filePath: string;
};

export function parseEminwonGoDownloadForms(
  html: string,
): EminwonGoDownloadForm[] {
  const forms: EminwonGoDownloadForm[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
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

export async function fetchEminwonGoDownloadAttachBody(
  html: string,
  endpoint = "https://eminwon.yeoju.go.kr/emwp/jsp/ofr/FileDownNew.jsp",
): Promise<string | null> {
  for (const form of parseEminwonGoDownloadForms(html)) {
    try {
      const body = new URLSearchParams({
        user_file_nm: form.userFileName,
        sys_file_nm: form.systemFileName,
        file_path: form.filePath,
      });
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": SI_UA,
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const attachBody = await extractAttachBody(
        new Uint8Array(await res.arrayBuffer()),
      );
      if (attachBody) return attachBody;
    } catch {
      continue;
    }
  }
  return null;
}

// 첨부 전문 우선 + SI 정적 본문(parseSiNttBody) fallback. baseDir 은 detail URL 의 디렉터리
// (성동 `${BASE}/main/`, 동대문·성북 `${BASE}/www/`) — 상대경로 href resolve 기준.
export async function parseSiAttachOrBody(
  html: string,
  baseDir: string,
): Promise<string | null> {
  const attach = await fetchSiAttachBody(html, baseDir);
  if (attach) return attach;
  return parseSiNttBody(html);
}
