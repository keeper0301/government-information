// instrumentation.ts
// ============================================================
// Next.js 15+ 표준 진입점 — Sentry SDK 서버·edge runtime init
// ============================================================
// Next.js 가 서버/edge 부팅 시 자동으로 register() 를 호출.
// process.env.NEXT_RUNTIME 으로 분기해 두 runtime 모두 SDK 활성화.
//
// SENTRY_DSN 환경변수가 비어 있으면 Sentry SDK 자체가 noop 으로 동작 →
// Vercel env 미등록 상태에서도 코드 회귀 0 (graceful fallback).
//
// onRequestError export 는 Next.js 15+ 에서 RSC/middleware/proxy 에러를
// 자동으로 Sentry 에 캡처하는 표준 hook (Sentry docs 권장).
// ============================================================

import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Node.js runtime — API routes·Server Actions·일반 SSR
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      // SSR/RSC 트레이스 — prod 0.1 비율로 비용 가드 (Free tier 5K/월 보호)
      tracesSampleRate: 0.1,
    });
  }

  // Edge runtime — middleware·edge route handler
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

// Next.js 15+ 의 RSC·middleware 에러 자동 capture hook
export const onRequestError = Sentry.captureRequestError;
