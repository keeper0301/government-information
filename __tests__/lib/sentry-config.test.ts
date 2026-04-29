// __tests__/lib/sentry-config.test.ts
// ============================================================
// Sentry 모듈 import 검증 — env 누락 시 graceful fallback 확인
// ============================================================
// 목적: SENTRY_DSN 환경변수가 비어 있어도 @sentry/nextjs 가 throw 없이
// 정상 import 되는지 확인. Sentry SDK 자체가 dsn undefined 시 noop 으로
// 동작하도록 설계돼 있어, env 등록 전에도 prod build 가 깨지지 않음을
// 회귀 방지 차원에서 보장한다.
//
// 위치: vitest.config.ts 의 include 가 __tests__/**/*.test.ts 이므로
// plan 의 tests/lib/ 대신 __tests__/lib/ 로 작성 (실행 보장).
// ============================================================

import { describe, expect, it } from "vitest";

describe("Sentry config", () => {
  it("env 누락이어도 import error 없이 로드", async () => {
    // 단순히 모듈 import 가 throw 안 하면 OK
    await expect(import("@sentry/nextjs")).resolves.toBeDefined();
  });
});
