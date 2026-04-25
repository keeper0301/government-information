// lib/personalization/score.ts
// 정책 1건이 사용자 프로필에 얼마나 맞는지 점수 계산
// spec §4-2 (Phase 1) 기준. 소득·가구상태는 본문 정규식 매칭으로 약한 가산점.
import { AGE_KEYWORDS, OCCUPATION_KEYWORDS } from '@/lib/profile-options';
import type { UserSignals, MatchSignal, ScoredItem } from './types';

// 점수 계산 대상 아이템 형태 정의
// welfare/loan/news 등 여러 영역에서 공통으로 사용 가능
export type ScorableItem = {
  id: string;
  title: string;
  description?: string | null;
  region?: string | null;
  district?: string | null;
  benefit_tags?: string[] | null;
  apply_end?: string | null;
  source?: string | null;
  // Phase 1.5: 정확 매칭 데이터 (extractTargeting 결과가 저장된 컬럼)
  income_target_level?: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags?: string[] | null;
};

// 광역시도 명칭 별칭 매핑 (DB에 저장된 정식 명칭 → 사용자 선택 짧은 명칭)
// 예: "서울특별시" → 사용자가 선택한 "서울"과 매칭되게 처리
const REGION_ALIASES: Record<string, string[]> = {
  '서울': ['서울특별시', '서울시', '서울'],
  '경기': ['경기도', '경기'],
  '인천': ['인천광역시', '인천시', '인천'],
  '부산': ['부산광역시', '부산시', '부산'],
  '대구': ['대구광역시', '대구시', '대구'],
  '광주': ['광주광역시', '광주시', '광주'],
  '대전': ['대전광역시', '대전시', '대전'],
  '울산': ['울산광역시', '울산시', '울산'],
  '세종': ['세종특별자치시', '세종시', '세종'],
  '강원': ['강원특별자치도', '강원도', '강원'],
  '충북': ['충청북도', '충북'],
  '충남': ['충청남도', '충남'],
  '전북': ['전북특별자치도', '전라북도', '전북'],
  '전남': ['전라남도', '전남'],
  '경북': ['경상북도', '경북'],
  '경남': ['경상남도', '경남'],
  '제주': ['제주특별자치도', '제주도', '제주'],
};

// 저소득 관련 키워드 목록
// 소득 수준이 낮은 사용자에게 관련 정책 가산점 부여용
const INCOME_KEYWORDS_LOW = ['기준중위소득', '차상위', '기초생활', '저소득'];

// 가구 유형 코드 → 본문 검색 키워드 매핑
// DB에서 사용하는 영문 코드를 실제 정책 본문에 나오는 한국어로 변환
const HOUSEHOLD_KEYWORDS: Record<string, string[]> = {
  'single_parent':    ['한부모', '한부모가정', '한부모가족'],  // 한부모 가정
  'multi_child':      ['다자녀', '셋째', '3자녀'],             // 다자녀 가정
  'married':          ['신혼', '신혼부부'],                    // 신혼부부
  'disabled_family':  ['장애', '장애인', '장애인가구'],         // 장애인 가구
  'elderly_family':   ['독거노인', '고령가구', '경로'],         // 노인 가구
  'single':           ['1인가구', '독거'],                     // 1인 가구
};

// 정책 지역이 사용자 지역과 매칭되는지 확인
// "전국" 정책은 모든 지역 사용자에게 매칭됨
function regionMatches(programRegion: string | null | undefined, userRegion: string): boolean {
  if (!programRegion) return false;
  // "전국" 키워드 포함 시 항상 매칭
  if (programRegion.includes('전국')) return true;
  // 사용자 선택 짧은 명칭(예: '서울')의 모든 별칭 목록으로 정책 지역 검색
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  return aliases.some(a => programRegion.includes(a));
}

// 사용자 incomeLevel 이 정책 income_target_level 자격을 충족하는지 확인
// 소득이 낮을수록 더 많은 정책 대상 — 예: low 사용자는 mid 정책도 신청 가능
function matchesIncomeRequirement(
  userLevel: UserSignals['incomeLevel'],
  programLevel: 'low' | 'mid_low' | 'mid' | 'any' | null | undefined,
): boolean {
  if (!userLevel || !programLevel) return false;
  // 'any' 는 모든 소득 수준 허용
  if (programLevel === 'any') return true;
  // 소득 수준 순서: low(0) < mid_low(1) < mid(2) < mid_high(3) < high(4)
  const userOrder: Record<NonNullable<UserSignals['incomeLevel']>, number> = {
    low: 0, mid_low: 1, mid: 2, mid_high: 3, high: 4,
  };
  // 정책 허용 수준 순서: low(0) < mid_low(1) < mid(2)
  const programOrder: Record<'low' | 'mid_low' | 'mid', number> = {
    low: 0, mid_low: 1, mid: 2,
  };
  // 사용자 소득 순서 <= 정책 허용 순서면 자격 충족
  // 예: low(0) <= mid(2) → true, high(4) <= low(0) → false
  return userOrder[userLevel] <= programOrder[programLevel];
}

// 마감일이 D-7 이내인지 확인 (긴박성 tiebreaker 가산점용)
function isUrgentDeadline(applyEnd: string | null | undefined): boolean {
  if (!applyEnd) return false;
  const ms = new Date(applyEnd).getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  // 0일 이상(아직 마감 안 됨) AND 7일 이하(일주일 내 마감)
  return days >= 0 && days <= 7;
}

// 정책 1건에 대해 사용자 프로필 적합도 점수 계산
// 반환값: 원본 아이템 + 합산 점수 + 기여 시그널 목록
export function scoreProgram<T extends ScorableItem>(
  program: T,
  user: UserSignals,
): ScoredItem<T> {
  const signals: MatchSignal[] = [];

  // 검색 대상 텍스트: 제목 + 설명 + 출처 합산
  const haystack = `${program.title ?? ''} ${program.description ?? ''} ${program.source ?? ''}`;

  // ① 지역 광역 매칭: +5점
  // 사용자 지역이 있고, "전국" 아닌 경우에만 지역 가산점 부여
  // (전국 정책은 아래 regionMatches 에서 '전국' 키워드 감지해서 처리)
  if (user.region && regionMatches(program.region, user.region)) {
    signals.push({ kind: 'region', score: 5 });
  }

  // ② 시군구 매칭: +5점 (광역 매칭이 있을 때만 추가 가산)
  // 광역이 이미 매칭된 경우에만 시군구 추가 점수
  if (user.district && program.district && program.district === user.district
      && signals.some(s => s.kind === 'region')) {
    signals.push({ kind: 'district', score: 5 });
  }

  // ③ 혜택 태그 교집합: 일치 1개당 +3점
  if (user.benefitTags.length && program.benefit_tags?.length) {
    const overlap = user.benefitTags.filter(t => program.benefit_tags!.includes(t));
    if (overlap.length > 0) {
      signals.push({
        kind: 'benefit_tags',
        score: 3 * overlap.length,
        detail: overlap.join(', '),
      });
    }
  }

  // ④ 직업 키워드 매칭: +2점
  // profile-options 의 OCCUPATION_KEYWORDS 사용 (중앙 관리)
  if (user.occupation) {
    const keywords = OCCUPATION_KEYWORDS[user.occupation] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'occupation', score: 2 });
    }
  }

  // ⑤ 연령 키워드 매칭: +1점
  // profile-options 의 AGE_KEYWORDS 사용 (중앙 관리)
  if (user.ageGroup) {
    const keywords = AGE_KEYWORDS[user.ageGroup] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'age', score: 1 });
    }
  }

  // ⑥ 소득 — 정확 매칭 우선 (+4), 없으면 본문 키워드 fallback (+2, Phase 1)
  if (program.income_target_level !== undefined && program.income_target_level !== null) {
    // DB 에 정확 매칭 데이터가 있을 때: 자격 충족 여부로 판단
    if (matchesIncomeRequirement(user.incomeLevel, program.income_target_level)) {
      signals.push({
        kind: 'income_target',
        score: 4,
        detail: program.income_target_level,
      });
    }
    // 정확 매칭이 있는데 자격 미달이면 fallback 도 하지 않음 (자격 미달은 자격 미달)
  } else if (user.incomeLevel === 'low' || user.incomeLevel === 'mid_low') {
    // Phase 1 fallback: 정확 매칭 데이터 없을 때만 본문 키워드로 약한 가산
    if (INCOME_KEYWORDS_LOW.some(k => haystack.includes(k))) {
      signals.push({ kind: 'income_keyword', score: 2 });
    }
  }

  // ⑦ 가구상태 — 정확 매칭 우선 (+3 × 일치 수), 없으면 본문 키워드 fallback (+2, Phase 1)
  if (program.household_target_tags && program.household_target_tags.length > 0) {
    // DB 에 정확 매칭 데이터가 있을 때: 교집합으로 판단
    const overlap = user.householdTypes.filter(ht =>
      program.household_target_tags!.includes(ht),
    );
    if (overlap.length > 0) {
      signals.push({
        kind: 'household_target',
        score: 3 * overlap.length,
        detail: overlap.join(', '),
      });
    }
  } else {
    // Phase 1 fallback: 정확 매칭 데이터 없을 때만 본문 키워드로 약한 가산
    for (const ht of user.householdTypes) {
      const keywords = HOUSEHOLD_KEYWORDS[ht] ?? [];
      if (keywords.some(k => haystack.includes(k))) {
        signals.push({ kind: 'household_keyword', score: 2, detail: ht });
      }
    }
  }

  // ⑧ 마감 임박 tiebreaker: +1점 (다른 매칭이 있을 때만!)
  // 스팸 방지: 아무 매칭 없는 정책이 마감 임박만으로 노출되지 않게
  if (signals.length > 0 && isUrgentDeadline(program.apply_end)) {
    signals.push({ kind: 'urgent_deadline', score: 1 });
  }

  // 모든 시그널 점수 합산
  const score = signals.reduce((sum, s) => sum + s.score, 0);
  return { item: program, score, signals };
}
