// lib/personalization/filter.ts
// 정책 목록 전체를 점수 계산 후 minScore/limit 로 필터링해 반환
// scoreProgram 을 내부적으로 사용하며, 호출자는 이 함수만 쓰면 됨
import { scoreProgram, type ScorableItem } from './score';
import type { UserSignals, ScoredItem } from './types';

// 필터링 옵션
export type FilterOptions = {
  minScore: number; // 이 점수 미만인 항목은 제외
  limit: number;    // 최대 반환 개수
};

// 정책 목록 → 점수 계산 → 필터링 → 정렬 → 최대 limit 개 반환
// T extends ScorableItem: welfare/loan/news 어떤 타입이든 처리 가능
export function scoreAndFilter<T extends ScorableItem>(
  programs: T[],
  user: UserSignals,
  options: FilterOptions,
): ScoredItem<T>[] {
  return programs
    .map(p => scoreProgram(p, user))          // 각 항목 점수 계산
    .filter(s => s.score >= options.minScore) // minScore 미만 제거
    .sort((a, b) => b.score - a.score)        // 점수 내림차순 정렬
    .slice(0, options.limit);                 // 최대 limit 개만 반환
}
