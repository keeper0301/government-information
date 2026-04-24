// ============================================================
// 온통청년 Detail Fetcher — raw_payload 활용 (외부 호출 없음)
// ============================================================
// 온통청년 공식 OPEN API 는 List 엔드포인트 (youthPlcyList.do) 만 제공하고
// 별도의 Detail 엔드포인트가 없음. 그러나 List 응답 자체가 이미 풍부한
// 필드 (연령·전공 요건·취업 상태·신청 절차 등) 를 포함하고, 기존 collector
// (youth-v2) 가 응답 원본을 `raw_payload` JSONB 컬럼에 그대로 저장 중.
//
// 따라서 이 fetcher 는 외부 HTTP 호출 없이 DB 의 raw_payload 에서 필드를
// 추출해 eligibility / contact_info / detailed_content 컬럼을 채움.
//   - API 쿼터 0 소비
//   - rate limit 제약 없음 → BATCH_SIZE·interval 여유
//   - data.go.kr 쿨다운 무관
//
// 전제: welfare row 에 source_code='youth-v2' 또는 'youth-v1' 이면서
// raw_payload 가 비어있지 않아야 함. 레거시 row (과거 수집, raw_payload NULL)
// 는 applies() false 로 스킵.
// ============================================================

import type { DetailFetcher, DetailResult, RowIdentity } from "./index";

// 온통청년 List API 응답의 한 항목 — youth-v2 collector 와 동일 스키마.
// 일부 필드는 API 명세상 선택적이라 optional. raw_payload 에서 동적 추출
// 이므로 unknown → 문자열 보장을 직접 수행.
type YouthItem = {
  ageInfo?: unknown;         // 연령 정보 (예: "만 19세 이상 34세 이하")
  majrRqisCn?: unknown;      // 전공 요건
  empmSttsCn?: unknown;      // 취업 상태
  splzRlmRqisCn?: unknown;   // 특화 분야
  cnsgNmor?: unknown;        // 주관기관
  prcpCn?: unknown;          // 사업운영기관
  polyItcnCn?: unknown;      // 정책소개 (이미 description 에 저장됨)
  sporCn?: unknown;          // 지원내용 (이미 benefits 에 저장됨)
  rqutProcCn?: unknown;      // 신청절차 (이미 apply_method 에 저장됨)
  rqutPrdCn?: unknown;       // 신청기간 원문
};

// "제한없음", "해당없음", "-", "" 같은 무의미한 값은 표시하지 않음.
// (사용자 화면에 "전공 요건: 해당없음" 같은 소음을 안 보이게 하기 위함.)
function isMeaningful(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (t.length === 0) return false;
  const SKIP = new Set(["-", "해당없음", "해당 없음", "제한없음", "제한 없음", "N", "없음"]);
  return !SKIP.has(t);
}

function str(raw: unknown): string | null {
  return isMeaningful(raw) ? raw.trim() : null;
}

// 지원대상(=eligibility) 조합 — 연령·전공·취업상태·특화분야 4필드 라벨링.
// welfare_programs.eligibility 현재 0.1% 채움률(2026-04-24 진단) → youth 1168건만
// 이 fetcher 로 채워도 전체 채움률이 크게 상승.
function buildEligibility(p: YouthItem): string | null {
  const lines: string[] = [];
  const age = str(p.ageInfo);
  const major = str(p.majrRqisCn);
  const empl = str(p.empmSttsCn);
  const splz = str(p.splzRlmRqisCn);
  if (age) lines.push(`연령: ${age}`);
  if (major) lines.push(`전공 요건: ${major}`);
  if (empl) lines.push(`취업 상태: ${empl}`);
  if (splz) lines.push(`특화 분야: ${splz}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// 주관·운영기관 — collector 가 source 에 cnsgNmor 만 넣으므로 여기서 보강.
function buildContactInfo(p: YouthItem): string | null {
  const lines: string[] = [];
  const host = str(p.cnsgNmor);
  const runner = str(p.prcpCn);
  if (host) lines.push(`주관기관: ${host}`);
  if (runner && runner !== host) lines.push(`운영기관: ${runner}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// 상세 본문 — collector 가 description/benefits/apply_method 에 개별 저장한
// 값들을 한 덩어리 `detailed_content` 로 재구성. 신청기간 원문 (rqutPrdCn) 은
// 어느 필드에도 저장되지 않아 여기서만 노출됨.
function buildDetailedContent(p: YouthItem): string | null {
  const sections: string[] = [];
  const intro = str(p.polyItcnCn);
  const support = str(p.sporCn);
  const proc = str(p.rqutProcCn);
  const period = str(p.rqutPrdCn);
  if (intro) sections.push(`▸ 정책 개요\n${intro}`);
  if (support) sections.push(`▸ 지원 내용\n${support}`);
  if (proc) sections.push(`▸ 신청 절차\n${proc}`);
  if (period) sections.push(`▸ 신청 기간\n${period}`);
  return sections.length > 0 ? sections.join("\n\n") : null;
}

const fetcher: DetailFetcher = {
  sourceCode: "youth-v2",
  label: "온통청년 raw_payload 추출",
  // 외부 호출이 없으므로 env 체크 불필요 — 언제나 활성.
  enabled: () => true,

  // youth-v2 (2025-05 이후 수집) 이거나 youth-v1 (레거시 태깅) 이면서
  // raw_payload 가 YouthItem 형태로 저장돼 있어야 적용.
  // source_id (= bizId) 도 필수 — 없으면 raw_payload 가 다른 형태일 수 있음.
  applies: (row: RowIdentity) => {
    if (row.source_code !== "youth-v2" && row.source_code !== "youth-v1") return false;
    if (!row.source_id) return false;
    if (!row.raw_payload || typeof row.raw_payload !== "object") return false;
    return true;
  },

  async fetchDetail(row: RowIdentity): Promise<DetailResult | null> {
    const payload = row.raw_payload as YouthItem | null;
    if (!payload) return null;

    const eligibility = buildEligibility(payload);
    const contact = buildContactInfo(payload);
    const detailed = buildDetailedContent(payload);

    // 추출 가능한 값이 하나도 없으면 null — enrich route 가 skipped 로 기록
    if (!eligibility && !contact && !detailed) return null;

    return {
      eligibility,
      contact_info: contact,
      detailed_content: detailed,
    };
  },
};

export default fetcher;
