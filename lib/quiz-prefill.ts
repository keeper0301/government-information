// lib/quiz-prefill.ts
// /quiz 답변을 쿠키에 임시 저장 → /signup → /onboarding 흐름에서
// 자동으로 채워주기 위한 가입 funnel helper.
//
// 흐름:
//   1) 사용자가 /quiz 결과 본 뒤 "이 답변으로 가입하기" 클릭
//   2) saveQuizPrefill(answers) → 쿠키 1시간 TTL 저장
//   3) /signup → 인증 → /auth/callback → /onboarding 진입
//   4) /onboarding/page.tsx 가 server 단에서 readQuizPrefillCookie() 로 읽어
//      initial 에 합쳐 OnboardingFlow 에 전달 → SSR 즉시 prefill 적용 (hydration safe)
//   5) onboarding-flow.tsx 가 mount 시 clearQuizPrefill() 으로 쿠키 삭제 — 재진입 시 재적용 방지
//
// 쿠키 1시간 TTL → 가입 메일 클릭까지 충분, 그 이상은 stale 자동 만료.
// SameSite=Lax → 메일 링크 redirect 후에도 살아있음.
import {
  AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS,
  INCOME_OPTIONS, HOUSEHOLD_OPTIONS,
  type AgeOption, type RegionOption, type OccupationOption,
  type IncomeOption, type HouseholdOption,
} from './profile-options';

// ============================================================
// 상수
// ============================================================
export const QUIZ_PREFILL_COOKIE_NAME = 'keepioo_quiz_prefill';
const TTL_SECONDS = 60 * 60; // 1시간

// ============================================================
// 타입
// ============================================================
export type QuizPrefill = {
  ageGroup: AgeOption | null;
  region: RegionOption | null;
  occupation: OccupationOption | null;
  incomeLevel: IncomeOption | null;
  householdTypes: HouseholdOption[];
};

// ============================================================
// 화이트리스트 narrow guards — JSON 디코드 결과 안전 변환
// ============================================================
function pickEnum<T extends string>(
  raw: unknown, allowed: readonly T[],
): T | null {
  if (typeof raw !== 'string') return null;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function pickHouseholds(raw: unknown): HouseholdOption[] {
  if (!Array.isArray(raw)) return [];
  const allowed = HOUSEHOLD_OPTIONS.map((o) => o.value);
  return raw.filter(
    (v): v is HouseholdOption =>
      typeof v === 'string' && (allowed as string[]).includes(v),
  );
}

// 임의 JSON → 안전한 QuizPrefill 변환 (서버·클라 공용)
export function parseQuizPrefill(raw: unknown): QuizPrefill | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const incomeAllowed = INCOME_OPTIONS.map((o) => o.value);
  const result: QuizPrefill = {
    ageGroup: pickEnum(obj.ageGroup, AGE_OPTIONS),
    region: pickEnum(obj.region, REGION_OPTIONS),
    occupation: pickEnum(obj.occupation, OCCUPATION_OPTIONS),
    incomeLevel: pickEnum<IncomeOption>(obj.incomeLevel, incomeAllowed),
    householdTypes: pickHouseholds(obj.householdTypes),
  };
  // 모든 필드가 비어있으면 prefill 없는 것과 동일 처리
  const empty =
    !result.ageGroup &&
    !result.region &&
    !result.occupation &&
    !result.incomeLevel &&
    result.householdTypes.length === 0;
  return empty ? null : result;
}

// ============================================================
// 클라이언트 측 — document.cookie 사용
// ============================================================
export function saveQuizPrefill(prefill: QuizPrefill): void {
  if (typeof document === 'undefined') return;
  try {
    const json = JSON.stringify(prefill);
    const encoded = encodeURIComponent(json);
    document.cookie = `${QUIZ_PREFILL_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${TTL_SECONDS}; SameSite=Lax`;
  } catch {
    // cookie 차단/길이 초과 — silent fail
  }
}

export function clearQuizPrefill(): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${QUIZ_PREFILL_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
}
