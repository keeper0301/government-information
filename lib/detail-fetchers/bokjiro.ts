// ============================================================
// 복지로 Detail API fetcher (NationalWelfaredetailedV001)
// ============================================================
// 호출: https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfaredetailedV001
// 파라미터: serviceKey, servId (= DB 의 source_id)
// 응답: XML. <wantedDtl> 루트 안에 상세 필드 + applmetList / inqplCtadrList 반복 블록
//
// List API (bokjiro collector) 가 못 채우는 필드를 풍부하게 채움:
//   tgtrDtlCn      → eligibility (지원대상 상세)
//   slctCritCn     → selection_criteria (선정기준)
//   alwServCn      → benefits (급여내용 상세. List API 의 srvPvsnNm 보다 구체)
//   applmetList    → apply_method (신청방법 단계 리스트)
//   inqplCtadrList → contact_info (문의처 리스트)
//   wlfareInfoOutlCn → detailed_content (서비스 개요 본문)
// ============================================================

import type { DetailFetcher, DetailResult, RowIdentity } from "./index";
import { fetchWithTimeout } from "@/lib/collectors";

const API = "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfaredetailedV001";
const KEY = process.env.DATA_GO_KR_API_KEY || "";

// 단순 단일 태그 값 추출 (list collector 와 동일 패턴)
function parseTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  const raw = m[1].replace(/<[^>]*>/g, "").trim();
  return raw.length > 0 ? raw : null;
}

// 반복 블록 (<applmetList>...</applmetList>) 전부 뽑기
function parseBlocks(xml: string, blockTag: string): string[] {
  const regex = new RegExp(`<${blockTag}>([\\s\\S]*?)</${blockTag}>`, "g");
  const out: string[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// 공백·연속 개행 정리 (XML 안에 들여쓰기 많이 들어있음)
function tidy(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return cleaned.length > 0 ? cleaned : null;
}

// applmetList → "단계명: 설명" 형식으로 합치기
// servSeDetailNm 에 단계명 (예 "신청기관연락처목록"), servSeDetailLink 에 실제 안내.
// 복지로가 단계별로 같은 응대기관을 반복하는 케이스 많아 중복 제거.
function joinApplyMethod(blocks: string[]): string | null {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const b of blocks) {
    const nm = parseTag(b, "servSeDetailNm");
    const link = parseTag(b, "servSeDetailLink");
    if (!link) continue;
    const key = `${nm || ""}|${link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(nm ? `[${nm}] ${link}` : link);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

// inqplCtadrList → "기관명: 연락처" 형식. 대표문의 prefix 포함.
function joinContactInfo(rprs: string | null, blocks: string[]): string | null {
  const lines: string[] = [];
  if (rprs) lines.push(`대표문의: ${rprs}`);
  const seen = new Set<string>();
  for (const b of blocks) {
    const nm = parseTag(b, "servSeDetailNm");
    const link = parseTag(b, "servSeDetailLink");
    if (!link) continue;
    const key = `${nm || ""}|${link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(nm ? `${nm}: ${link}` : link);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

const fetcher: DetailFetcher = {
  sourceCode: "bokjiro",
  label: "복지로 Detail API",
  enabled: () => !!KEY,

  // source_code 가 bokjiro 이고 source_id 가 WLF... 형식
  applies: (row: RowIdentity) => {
    if (row.source_code !== "bokjiro") return false;
    if (!row.source_id) return false;
    return /^WLF\d+$/.test(row.source_id);
  },

  async fetchDetail(row: RowIdentity): Promise<DetailResult | null> {
    if (!row.source_id) return null;
    const url = `${API}?serviceKey=${encodeURIComponent(KEY)}&servId=${encodeURIComponent(row.source_id)}`;
    const res = await fetchWithTimeout(url, { timeoutMs: 15000 });
    if (!res.ok) throw new Error(`bokjiro-detail HTTP ${res.status}`);
    const xml = await res.text();

    // 실패 응답 판정 — NO DATA FOUND / API not found / 에러코드
    if (xml.includes("NO DATA FOUND")) return null;
    if (xml.length < 200 && !xml.includes("<wantedDtl>")) return null;

    const applyBlocks = parseBlocks(xml, "applmetList");
    const contactBlocks = parseBlocks(xml, "inqplCtadrList");
    const rprs = parseTag(xml, "rprsCtadr");

    return {
      eligibility: tidy(parseTag(xml, "tgtrDtlCn")),
      selection_criteria: tidy(parseTag(xml, "slctCritCn")),
      benefits: tidy(parseTag(xml, "alwServCn")),
      apply_method: tidy(joinApplyMethod(applyBlocks)),
      contact_info: tidy(joinContactInfo(rprs, contactBlocks)),
      detailed_content: tidy(parseTag(xml, "wlfareInfoOutlCn")),
    };
  },
};

export default fetcher;
