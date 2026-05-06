// lib/personalization/types.ts
// 추천 엔진 공용 타입. 영역(welfare/loan/news/blog) 독립적으로 설계.
import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from '@/lib/profile-options';
import type { BenefitTag } from '@/lib/tags/taxonomy';
import type { BusinessProfile } from '@/lib/eligibility/business-match';

// 사용자 프로필에서 뽑아낸 시그널 (신호) 묶음
// 추천 점수 계산의 입력값으로 사용
export type UserSignals = {
  ageGroup: AgeOption | null;        // 연령대 (예: '30대')
  region: RegionOption | null;       // 광역시도 (예: '서울')
  district: string | null;           // 시군구 (예: '강남구')
  occupation: OccupationOption | null; // 직업 (예: '직장인')
  incomeLevel: 'low' | 'mid_low' | 'mid' | 'mid_high' | 'high' | null; // 소득 수준
  householdTypes: string[];          // 가구 유형 목록 (예: ['single_parent'])
  benefitTags: BenefitTag[];        // 관심 혜택 태그 목록 (예: ['주거', '교육'])
  hasChildren: boolean | null;       // 자녀 유무 (산후조리·영유아 cohort 매칭). NULL=미입력 → 게이트 미적용.
  merit: 'merit' | 'none' | null;    // 보훈 가족 (NATIONAL_MERIT cohort 매칭). NULL/none=차단, merit=통과.
  businessProfile?: BusinessProfile | null; // 자영업자 자격 진단 wedge — 입력 안한 사용자는 null/undefined
};

// 매칭 시그널 1개 — 점수에 기여한 이유와 점수를 함께 기록
export type MatchSignal = {
  kind: 'region' | 'district' | 'benefit_tags' | 'occupation' | 'age'
        | 'income_keyword' | 'household_keyword' | 'urgent_deadline'
        | 'income_target' | 'household_target'  // Phase 1.5: 정확 매칭 시그널
        | 'business_match';                      // 자영업자 자격 정확 매칭 (Basic wedge)
  score: number;   // 이 시그널이 기여한 점수
  detail?: string; // 부가 설명 (예: 어떤 태그가 일치했는지)
};

// 점수가 매겨진 항목 — 원본 데이터 + 점수 + 기여 시그널 목록
export type ScoredItem<T> = {
  item: T;                  // 원본 정책/대출/뉴스 데이터
  score: number;            // 최종 합산 점수
  signals: MatchSignal[];   // 점수에 기여한 시그널 목록 (투명성 확보용)
};

// '나만의 추천' 섹션 노출 최소 점수 — 이 점수 미만이면 노출하지 않음.
// 6 = region(5)+age(1) 또는 region(5)+occupation(1) 같은 약한 2 신호 매칭부터 통과.
// 이전엔 8 (region 한 가지로는 부족, 강한 2 신호 필요) 이었으나 진단 도구
// (commit 05027a4) 측정 결과 평균 노출률 welfare 2.8% / loan 4% / news 1.7% 로
// 사용자가 사실상 추천 0건 보는 상태. below_min_score 차단 다수가 점수 5-7
// 부분 매칭이라 경계 미달로 차단됨 — 노출률 ↑ 위해 6 으로 완화.
// region 한 가지(5점) 만으로는 여전히 부족 — 다른 시그널 1점 이상 필요.
export const PERSONAL_SECTION_MIN_SCORE = 6;
// '나만의 추천' 섹션 최대 노출 항목 수
export const PERSONAL_SECTION_MAX_ITEMS = 10;
