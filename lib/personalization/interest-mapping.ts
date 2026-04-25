// lib/personalization/interest-mapping.ts
// /mypage/profile-form 의 INTERESTS 9개 → BENEFIT_TAGS 14종 매핑
// DB 트리거(039 + 042 patch) 와 반드시 동기화
//
// 실제 라벨 (app/mypage/profile-form.tsx):
//   복지 / 대출 / 청년 / 출산·육아 / 창업 / 주거 / 교육 / 의료 / 고용
//
// 매핑 결정 (사장님 결정 2026-04-25):
// - 복지·청년: 매핑 없음 (복지는 너무 광범위, 청년은 인구통계 신호)
// - 나머지 7개: 자연스러운 1:1 매핑
import type { BenefitTag } from '@/lib/tags/taxonomy';

// 마이페이지 관심사 → 혜택 태그 매핑 테이블
// 키: 마이페이지 관심사 라벨, 값: 대응하는 BENEFIT_TAGS 배열
export const INTEREST_TO_BENEFIT_TAGS: Record<string, BenefitTag[]> = {
  '주거':       ['주거'],   // 주거 관심 → 주거 혜택
  '의료':       ['의료'],   // 의료 관심 → 의료 혜택
  '고용':       ['취업'],   // 고용 관심 → 취업 혜택
  '창업':       ['창업'],   // 창업 관심 → 창업 혜택
  '교육':       ['교육'],   // 교육 관심 → 교육 혜택
  '대출':       ['금융'],   // 대출 관심 → 금융 혜택
  '출산·육아':  ['양육'],   // 출산·육아 관심 → 양육 혜택
  // '복지': 너무 광범위 → 매핑 없음 (모든 정책이 복지이므로 의미 없음)
  // '청년': 인구통계 신호 → 매핑 없음 (ageGroup 시그널로 처리)
};

// 관심사 목록을 혜택 태그 목록으로 변환
// - null 또는 빈 배열 → 빈 배열 반환
// - 알 수 없는 관심사는 무시
// - 중복 태그 제거 후 반환
export function interestsToBenefitTags(interests: string[] | null): BenefitTag[] {
  // 입력이 없으면 바로 빈 배열 반환
  if (!interests?.length) return [];

  // Set으로 중복 자동 제거
  const set = new Set<BenefitTag>();
  for (const it of interests) {
    // 매핑된 태그가 있으면 Set에 추가 (없으면 ?? [] → 그냥 건너뜀)
    for (const tag of INTEREST_TO_BENEFIT_TAGS[it] ?? []) {
      set.add(tag);
    }
  }
  return Array.from(set);
}
