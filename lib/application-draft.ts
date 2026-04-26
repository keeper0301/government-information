// lib/application-draft.ts
// Pro 사용자 전용 — 정책 신청서 초안 자동 생성 (Stage 3 wedge).
//
// LLM-free: chatbot 패턴 (정규식 + 키워드 매칭 + 템플릿) 만 사용.
// Gemini 폐기 후 데이터 추출은 모두 정규식·사전 기반.
//
// 흐름:
//   1) classifyPolicyType — 정책을 5종 type 중 하나로 분류 (소상공인 자금 / 복지 보조금 / 주거 / 청년 / 일반)
//   2) generateApplicationDraft — type 별 template + 사용자 정보 (user + business) 자동 채움
//   3) UI 가 ApplicationDraft 객체를 신청서 form 으로 렌더 + print-to-PDF
//
// 사용자가 입력해야 하는 자유 작성 (신청 사유) 만 빈 칸. 나머지는 자동.
//
// 책임 안내: AI 자동 생성이라 사용자 검토 의무. 면책 문구를 disclaimers 에 포함.

import type { BusinessProfile } from '@/lib/eligibility/business-match';

// ============================================================
// 타입
// ============================================================
export type PolicyType =
  | 'business_funding' // 소상공인·자영업자 정책자금
  | 'welfare_grant'    // 복지 보조금·수당
  | 'housing'          // 주거 지원
  | 'youth'            // 청년 정책
  | 'general';         // 그 외

export type UserDraftProfile = {
  email: string | null;
  age_group: string | null;
  region: string | null;
  district: string | null;
  occupation: string | null;
  income_level: string | null;
  household_types: string[];
  // 자영업자만 입력 — 없으면 사업장 섹션 생략
  business: BusinessProfile | null;
};

export type DraftField = {
  label: string;
  value: string;
  // 빈 값일 때 안내 문구 (사용자가 채워야 할 부분)
  placeholder?: string;
};

export type DraftSection = {
  heading: string;
  fields: DraftField[];
  // 자유 작성 영역 (사용자가 직접 작성, AI 가 hint 만 제공)
  freeform?: {
    label: string;
    hint: string;
    minLength?: number;
    maxLength?: number;
  };
};

export type ApplicationDraft = {
  policyTitle: string;
  policyType: PolicyType;
  sections: DraftSection[];
  requiredDocuments: string[];
  disclaimers: string[];
  applyUrl: string | null;
};

// ============================================================
// 정책 type 분류
// ============================================================
type ProgramForClassify = {
  title: string;
  category: string | null;
  source: string;
  benefit_tags: string[] | null;
};

export function classifyPolicyType(program: ProgramForClassify): PolicyType {
  const haystack = `${program.title} ${program.category ?? ''} ${program.source}`;
  const tags = program.benefit_tags ?? [];

  // 소상공인·자영업자 자금 — 가장 명확한 wedge target
  if (
    /mss|kinfa|fsc|sbiz|semas|소상공인|자영업|창업자금|정책자금/.test(haystack) ||
    tags.includes('소상공인') ||
    tags.includes('창업')
  ) {
    return 'business_funding';
  }
  // 청년
  if (
    /youth|청년/.test(haystack) ||
    tags.includes('청년') ||
    tags.includes('학생·교육')
  ) {
    return 'youth';
  }
  // 주거
  if (/주거|전세|임대|주택|월세/.test(haystack) || tags.includes('주거')) {
    return 'housing';
  }
  // 복지 보조금
  if (
    /bokjiro|복지|보조금|수당|급여|돌봄/.test(haystack) ||
    tags.includes('복지')
  ) {
    return 'welfare_grant';
  }
  return 'general';
}

// ============================================================
// 첨부 서류
// ============================================================
const COMMON_DOCS_BY_TYPE: Record<PolicyType, string[]> = {
  business_funding: [
    '사업자등록증명원 1부',
    '국세·지방세 납세증명서 각 1부',
    '재무제표 또는 부가가치세 신고서 (최근 1~3년)',
    '신용정보 활용 동의서',
    '사업계획서 (정책 별도 양식)',
  ],
  welfare_grant: [
    '신분증 사본',
    '주민등록등본 1부',
    '소득금액증명원 또는 건강보험 자격득실 확인서',
    '가족관계증명서 (해당 시)',
    '입금받을 통장 사본',
  ],
  housing: [
    '신분증 사본',
    '주민등록등본 1부',
    '소득증명서 또는 재직증명서',
    '임대차계약서 사본 (해당 시)',
    '입금받을 통장 사본',
  ],
  youth: [
    '신분증 사본',
    '주민등록등본 1부',
    '재학증명서 또는 졸업증명서',
    '소득증명서 (본인 또는 부모)',
    '신청서 (정책 별도 양식)',
  ],
  general: [
    '신분증 사본',
    '주민등록등본 1부',
    '관련 증빙서류 (정책별 상이)',
  ],
};

// 정책 본문에서 추가 서류 추출 — "○○○ 1부" / "△△△ 사본" 패턴
function extractAdditionalDocs(text: string): string[] {
  if (!text) return [];
  const matches = text.match(
    /[가-힣A-Z][가-힣\s\w]{1,15}(?:증명원|확인서|등본|사본|신청서|동의서|계약서)(?:\s*\d+부)?/g,
  );
  if (!matches) return [];
  // 정규화 + 중복 제거 + 최대 5개
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of matches) {
    const normalized = raw.trim().replace(/\s+/g, ' ');
    const key = normalized.replace(/\s*\d+부$/, '');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
      if (result.length >= 5) break;
    }
  }
  return result;
}

export function getRequiredDocuments(
  program: { description?: string | null; apply_method?: string | null },
  type: PolicyType,
): string[] {
  const baseList = COMMON_DOCS_BY_TYPE[type];
  const haystack = `${program.description ?? ''} ${program.apply_method ?? ''}`;
  const extracted = extractAdditionalDocs(haystack);
  // base 우선 + 추출된 것 중 중복 안 되는 것만 추가
  const result = [...baseList];
  for (const doc of extracted) {
    const docKey = doc.replace(/\s*\d+부$/, '').trim();
    if (!result.some((d) => d.includes(docKey))) {
      result.push(doc);
    }
  }
  return result;
}

// ============================================================
// label 매핑 (BusinessProfile enum → 사람이 읽을 한국어)
// ============================================================
const INDUSTRY_LABEL: Record<string, string> = {
  food: '외식·요식업',
  retail: '소매·도소매',
  manufacturing: '제조업',
  service: '서비스업',
  it: 'IT·콘텐츠',
  other: '기타',
};
const REVENUE_LABEL: Record<string, string> = {
  under_50m: '5천만원 미만',
  '50m_500m': '5천만~5억원',
  '500m_1b': '5억~10억원',
  '1b_10b': '10억~100억원',
  over_10b: '100억원 이상',
};
const EMPLOYEE_LABEL: Record<string, string> = {
  none: '없음 (1인 사업자)',
  '1_4': '1~4명',
  '5_9': '5~9명',
  '10_49': '10~49명',
  '50_99': '50~99명',
  over_100: '100명 이상',
};
const BUSINESS_TYPE_LABEL: Record<string, string> = {
  sole_proprietor: '개인 사업자',
  corporation: '법인 사업자',
};

function lookup(map: Record<string, string>, v: string | null): string {
  return v ? map[v] ?? v : '';
}

// ============================================================
// 핵심 함수 — 신청서 초안 생성
// ============================================================
type ProgramForDraft = ProgramForClassify & {
  description: string | null;
  eligibility: string | null;
  benefits: string | null;
  apply_method: string | null;
  apply_url: string | null;
};

export function generateApplicationDraft(
  program: ProgramForDraft,
  user: UserDraftProfile,
): ApplicationDraft {
  const policyType = classifyPolicyType(program);

  // 1. 지원자 기본 정보
  const applicantAddress = [user.region, user.district].filter(Boolean).join(' ');
  const sections: DraftSection[] = [
    {
      heading: '1. 지원자 기본 정보',
      fields: [
        { label: '성명', value: '', placeholder: '신분증과 동일하게 입력' },
        { label: '연락처', value: '', placeholder: '010-XXXX-XXXX' },
        { label: '이메일', value: user.email ?? '' },
        { label: '주소', value: applicantAddress, placeholder: '광역·시군구·상세주소' },
        { label: '연령대', value: user.age_group ?? '' },
        { label: '직업', value: user.occupation ?? '' },
      ],
    },
  ];

  // 2. 사업장 정보 (자영업자 자금 + business profile 있을 때만)
  if (policyType === 'business_funding' && user.business) {
    const b = user.business;
    const businessAddress = [b.region, b.district].filter(Boolean).join(' ');
    sections.push({
      heading: '2. 사업장 정보',
      fields: [
        { label: '업종', value: lookup(INDUSTRY_LABEL, b.industry) },
        { label: '연 매출 규모', value: lookup(REVENUE_LABEL, b.revenue_scale) },
        { label: '상시근로자 수', value: lookup(EMPLOYEE_LABEL, b.employee_count) },
        { label: '사업자 유형', value: lookup(BUSINESS_TYPE_LABEL, b.business_type) },
        { label: '사업자등록일', value: b.established_date ?? '' },
        { label: '사업장 소재지', value: businessAddress },
        {
          label: '사업자등록번호',
          value: '',
          placeholder: 'XXX-XX-XXXXX (등록증과 동일)',
        },
      ],
    });
  }

  // 3. 자격 요건 충족 확인 (정책에 eligibility 있을 때만)
  if (program.eligibility) {
    sections.push({
      heading: `${sections.length + 1}. 자격 요건 충족 확인`,
      fields: [
        { label: '정책 명시 자격', value: program.eligibility },
        {
          label: '본인 충족 여부',
          value: '',
          placeholder: '충족 / 부분 충족 / 미해당 (사유)',
        },
      ],
    });
  }

  // 4. 신청 사유 (사용자 자유 작성, AI 가 type 별 hint 제공)
  const reasonHints: Record<PolicyType, string> = {
    business_funding:
      '현재 사업 운영 상황·자금이 필요한 구체적 이유·사용 계획을 200자 이상 작성',
    welfare_grant: '현재 가구 상황·지원이 필요한 구체적 이유를 200자 이상 작성',
    housing: '현재 주거 상황·이주 또는 보증금 마련 필요성을 200자 이상 작성',
    youth: '학업·취업·자격증 준비 등 본 정책이 필요한 이유를 200자 이상 작성',
    general: '본 정책이 필요한 구체적 사유를 200자 이상 작성',
  };
  sections.push({
    heading: `${sections.length + 1}. 신청 사유`,
    fields: [],
    freeform: {
      label: '신청 사유',
      hint: reasonHints[policyType],
      minLength: 200,
      maxLength: 1000,
    },
  });

  return {
    policyTitle: program.title,
    policyType,
    sections,
    requiredDocuments: getRequiredDocuments(program, policyType),
    disclaimers: [
      '본 신청서 초안은 keepioo 가 사장님 정보와 정책 본문을 바탕으로 자동 생성한 참고용 자료입니다. 실제 양식과 다를 수 있습니다.',
      '실제 신청 전에 정책 공식 페이지에서 양식·자격 요건·접수 방법을 반드시 직접 확인하세요.',
      '허위 기재 시 환수·고발 등 불이익이 발생할 수 있으므로 모든 정보를 사실대로 작성해 주세요.',
      '개인정보·민감정보는 정책 발급 기관 외부에 공유하지 마세요.',
    ],
    applyUrl: program.apply_url,
  };
}

// type 별 한국어 라벨 (UI 헤더 표시용)
export const POLICY_TYPE_LABEL: Record<PolicyType, string> = {
  business_funding: '소상공인·자영업자 자금',
  welfare_grant: '복지 보조금',
  housing: '주거 지원',
  youth: '청년 정책',
  general: '일반 정책',
};
