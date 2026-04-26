export type WelfareProgram = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  description: string | null;
  eligibility: string | null;
  benefits: string | null;
  apply_method: string | null;
  apply_url: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
  source_url: string | null;
  source_code: string | null;
  region: string | null;
  serv_id: string | null;
  detailed_content: string | null;
  selection_criteria: string | null;
  required_documents: string | null;
  contact_info: string | null;
  last_enriched_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  // 분류 통일 (031~035) — DB 에는 있는데 manual 타입에 누락돼 있던 컬럼
  benefit_tags: string[] | null;
  age_tags: string[] | null;
  occupation_tags: string[] | null;
  household_tags: string[] | null;
  region_tags: string[] | null;
  // Phase 1.5: 본문 분석으로 채워지는 자격 컬럼 (043 마이그레이션)
  income_target_level: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags: string[] | null;
  last_targeting_analyzed_at: string | null;
};

export type LoanProgram = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  description: string | null;
  eligibility: string | null;
  loan_amount: string | null;
  interest_rate: string | null;
  repayment_period: string | null;
  apply_method: string | null;
  apply_url: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
  source_url: string | null;
  source_code: string | null;
  detailed_content: string | null;
  required_documents: string | null;
  contact_info: string | null;
  last_enriched_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  // 분류 통일 (031~035) — DB 에는 있는데 manual 타입에 누락돼 있던 컬럼
  // welfare hot-fix(1cc2676) 와 동일 패턴으로 정정
  benefit_tags: string[] | null;
  age_tags: string[] | null;
  occupation_tags: string[] | null;
  household_tags: string[] | null;
  region_tags: string[] | null;
  // Phase 1.5: 본문 분석으로 채워지는 자격 컬럼 (043 마이그레이션)
  income_target_level: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags: string[] | null;
  last_targeting_analyzed_at: string | null;
};

export type AlarmSubscription = {
  id: string;
  user_id: string;
  email: string;
  program_type: "welfare" | "loan";
  program_id: string;
  notify_before_days: number;
  is_active: boolean;
  created_at: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  tags: string[] | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
};

export type UserProfile = {
  id: string;
  age_group: string | null;
  region: string | null;
  district: string | null;
  occupation: string | null;
  interests: string[] | null;
  // 마이그레이션 038: 맞춤형 추천을 위한 확장 컬럼
  income_level: 'low' | 'mid_low' | 'mid' | 'mid_high' | 'high' | null;
  household_types: string[] | null;  // ['single','married','single_parent','multi_child','disabled_family','elderly_family']
  benefit_tags: string[] | null;     // 039 트리거가 interests 에서 자동 변환
  // 마이그레이션 041: 온보딩 dismiss 추적
  dismissed_onboarding_at: string | null;
  created_at: string;
};

// 마이그레이션 040: 자동 알림 규칙 추적 컬럼 추가
export type UserAlertRule = {
  id: string;
  user_id: string;
  name: string;
  region_tags: string[] | null;
  age_tags: string[] | null;
  occupation_tags: string[] | null;
  benefit_tags: string[] | null;
  household_tags: string[] | null;
  // Phase 1.5 income 매칭 (054). NULL 이면 무관, 그 외엔 income_target_level 정확 매칭.
  income_target: 'low' | 'mid_low' | 'mid' | 'any' | null;
  keyword: string | null;
  channels: string[];
  phone_number: string | null;
  is_active: boolean;
  is_auto_generated: boolean | null;
  auto_rule_disabled_at: string | null;
  created_at: string;
  updated_at: string;
};
