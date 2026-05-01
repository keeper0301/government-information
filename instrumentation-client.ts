// instrumentation-client.ts
// ============================================================
// 브라우저 사이드 Sentry init — Next.js 15.x 부터 별도 파일 표준
// ============================================================
// Next.js 가 클라이언트 번들 빌드 시 자동으로 이 파일을 entry 로 포함.
// 브라우저에서 발생하는 unhandled error·promise rejection·React render
// 에러를 Sentry 에 전송한다.
//
// NEXT_PUBLIC_ prefix 가 붙은 환경변수만 클라이언트에 노출 가능.
// DSN 은 공개돼도 안전 (read-only 에러 ingest 키, 서버측 토큰 아님).
//
// Session Replay 는 비용·개인정보 보호를 위해 0 으로 비활성화.
// 추후 필요 시 replaysOnErrorSampleRate 만 0.1 정도로 켜면 됨.
// ============================================================

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 브라우저 트레이스 — prod 0.1 비율 (서버와 동일)
  tracesSampleRate: 0.1,
  // Session Replay 모두 비활성 (비용·개인정보 신중)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
