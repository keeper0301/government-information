// lib/quiz-prefill-server.ts
// 서버 컴포넌트·route handler 에서 quiz prefill 쿠키를 읽기 위한 helper.
//
// next/headers 의 cookies() 는 server-only 라 client 컴포넌트가 import 하면
// 빌드 에러. 그래서 client 헬퍼(lib/quiz-prefill.ts) 와 파일 분리.
//
// 사용: app/onboarding/page.tsx 에서 readQuizPrefillFromCookie() 호출 →
//       반환값을 OnboardingFlow 의 initial 에 합쳐서 전달.
import 'server-only';
import { cookies } from 'next/headers';
import {
  QUIZ_PREFILL_COOKIE_NAME,
  parseQuizPrefill,
  type QuizPrefill,
} from './quiz-prefill';

export async function readQuizPrefillFromCookie(): Promise<QuizPrefill | null> {
  try {
    const store = await cookies();
    const raw = store.get(QUIZ_PREFILL_COOKIE_NAME)?.value;
    if (!raw) return null;
    const json = decodeURIComponent(raw);
    const parsed: unknown = JSON.parse(json);
    return parseQuizPrefill(parsed);
  } catch {
    // 쿠키 깨짐·디코드 실패 — prefill 없는 것과 동일 처리
    return null;
  }
}
