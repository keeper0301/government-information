// ============================================================
// mss (중소벤처기업부) Detail Fetcher — raw_payload 활용 (외부 호출 없음)
// ============================================================
// data.go.kr 의 mssBizService_v2 는 별도 Detail 엔드포인트 미제공.
// collector (lib/collectors/loans-mss.ts) 가 List API 응답 XML 의 모든 태그를
// parseAllTags() 로 dict 화해서 raw_payload (JSONB) 에 보존 중 (Phase 1, 66b97aa).
// 이 fetcher 는 외부 HTTP 호출 없이 raw_payload 에서 필드를 추출해
// eligibility / contact_info / detailed_content 컬럼을 채움.
//
// 패턴은 youthcenter.ts (be3e5dc) 와 동일.
//
// 전제: loan row 에 source_code='mss' 이면서 raw_payload 가 비어있지 않아야 함.
// Phase 1 적용 전에 수집된 row (raw_payload NULL) 는 applies() false 로 스킵 →
// 다음 collector cron 이 같은 source_id upsert 하며 raw_payload 갱신 →
// 그 다음 enrich 라운드에 자연 진입.
//
// 매핑 가설: mss API 응답 XML 의 정확한 태그명은 미확정 (Phase 1 직후라 실데이터
// 미관찰). buildXxx 함수들은 fallback chain 으로 어떤 키 이름이든 첫 매치 사용.
// prod dryrun 결과 보고 fallback chain 보정 (필요 시 후속 commit).
// ============================================================

import type { DetailFetcher, DetailResult, RowIdentity } from "./index";

// mss List API 응답의 한 항목 — collector 의 parseAllTags() 가 dict 로 변환.
// 모든 필드는 unknown — runtime 에서 isMeaningful() / str() 로 안전 추출.
type MssItem = {
  // 기본 필드 (collector 가 이미 다른 컬럼에 사용)
  title?: unknown;
  viewUrl?: unknown;
  dataContents?: unknown;
  writerPosition?: unknown;
  applicationStartDate?: unknown;
  applicationEndDate?: unknown;
  // 자격 요건 후보 (실제 키 1~2개로 좁아질 것)
  requirements?: unknown;
  supportTarget?: unknown;
  recipientCondition?: unknown;
  qualification?: unknown;
  eligibility?: unknown;
  // 담당·연락 후보
  contactInfo?: unknown;
  manager?: unknown;
  department?: unknown;
  telNo?: unknown;
  tel?: unknown;
  email?: unknown;
  // 본문 보강 후보
  businessField?: unknown;
  supportField?: unknown;
  businessCategory?: unknown;
  applicationPeriod?: unknown;
  recruitPeriod?: unknown;
  // mss API 가 주는 그 외 임의 키도 안전하게 받기 위한 인덱스 시그니처
  [key: string]: unknown;
};

// "제한없음", "해당없음", "-", "미정", "추후공지" 등 무의미한 값은 표시 안 함.
// (사용자 화면에 "지원대상: 해당없음" 같은 소음을 안 보이게 하기 위함.)
function isMeaningful(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (t.length === 0) return false;
  const SKIP = new Set([
    "-",
    "해당없음",
    "해당 없음",
    "해당사항 없음",
    "제한없음",
    "제한 없음",
    "N",
    "없음",
    "미정",
    "추후 공지",
    "추후공지",
    "별도 공지",
  ]);
  return !SKIP.has(t);
}

function str(raw: unknown): string | null {
  return isMeaningful(raw) ? raw.trim() : null;
}

// 지원 대상·자격 요건 — writerPosition (collector 가 target 컬럼에도 저장하는 값)
// 을 라벨링하고, 추가 자격 텍스트가 있으면 fallback chain 으로 탐색해 합침.
// welfare/loan_programs.eligibility 채움률 0% (2026-04-24 진단) → 549건이 첫 번째
// 컬럼 채움.
function buildEligibility(p: MssItem): string | null {
  const lines: string[] = [];
  const target = str(p.writerPosition);
  if (target) lines.push(`대상: ${target}`);
  // fallback chain — 실제 응답 태그명은 prod dryrun 으로 확정
  const condition =
    str(p.eligibility) ||
    str(p.requirements) ||
    str(p.supportTarget) ||
    str(p.recipientCondition) ||
    str(p.qualification);
  if (condition) lines.push(`자격: ${condition}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// 담당 부서·연락처 — fallback chain 으로 mss 의 실제 키 패턴에 적응.
// 동일 값이 두 키에 중복 등장하는 경우 (예: department=manager) dedup.
function buildContactInfo(p: MssItem): string | null {
  const lines: string[] = [];
  const dept = str(p.department) || str(p.manager);
  const contact = str(p.contactInfo);
  const tel = str(p.telNo) || str(p.tel);
  const email = str(p.email);
  if (dept) lines.push(`담당부서: ${dept}`);
  if (contact && contact !== dept) lines.push(`담당자/문의: ${contact}`);
  if (tel) lines.push(`연락처: ${tel}`);
  if (email) lines.push(`이메일: ${email}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// 상세 본문 — dataContents (사업 본문) 가 핵심 + 모집분야·신청기간 원문 등
// 보강 텍스트. "▸ 섹션명\n내용" 포맷 — youthcenter 와 시각적 구조 동일.
function buildDetailedContent(p: MssItem): string | null {
  const sections: string[] = [];
  const main = str(p.dataContents);
  const field =
    str(p.businessField) || str(p.supportField) || str(p.businessCategory);
  const period = str(p.applicationPeriod) || str(p.recruitPeriod);
  if (main) sections.push(`▸ 사업 내용\n${main}`);
  if (field) sections.push(`▸ 모집 분야\n${field}`);
  if (period) sections.push(`▸ 신청 기간\n${period}`);
  return sections.length > 0 ? sections.join("\n\n") : null;
}

const fetcher: DetailFetcher = {
  sourceCode: "mss",
  label: "mss raw_payload 추출",
  // 외부 호출 없으므로 env 체크 불필요 — 언제나 활성.
  enabled: () => true,

  // mss 이면서 source_id·raw_payload 둘 다 있어야 적용.
  // raw_payload NULL 인 레거시 row 는 false → enrich route 가 skipped 처리.
  applies: (row: RowIdentity) => {
    if (row.source_code !== "mss") return false;
    if (!row.source_id) return false;
    if (!row.raw_payload || typeof row.raw_payload !== "object") return false;
    return true;
  },

  async fetchDetail(row: RowIdentity): Promise<DetailResult | null> {
    const payload = row.raw_payload as MssItem | null;
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
