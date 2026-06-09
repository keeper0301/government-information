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

import { extractText, getDocumentProxy } from "unpdf";
import { toMarkdown } from "@ohah/hwpjs";
import { parseSiNttBody } from "./_si_ntt_helper";

const SI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 첨부 download 링크 — SI(downloadBbsFile.do)·eGovFrame portal/bbs(fileDown.do) 공통.
// href 안에 개행/탭이 섞여 \s 제거 + &amp; 디코드 필요.
const DOWNLOAD_REGEX = /href="([^"]*(?:downloadBbsFile|fileDown)\.do[^"]*)"/gi;

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

// 첨부 버퍼 → PDF(unpdf)/hwp5(@ohah) 전문. 250+ 한글이면 반환, 아니면 null(hwp·HTML 에러
// 페이지·짧은 첨부 방어).
async function extractAttachBody(buf: Uint8Array): Promise<string | null> {
  // PDF (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
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
