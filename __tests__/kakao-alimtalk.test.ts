import { describe, it, expect } from "vitest";
import { isAlimtalkQuietHours } from "@/lib/kakao-alimtalk";

// ============================================================
// isAlimtalkQuietHours — 정보통신망법 제50조의5
// KST 21:00~익일 08:00 발송 차단
// ============================================================
// KST = UTC + 9 (서머타임 미실시).
// new Date('2026-04-27T12:00:00Z') 의 UTC 12시 == KST 21:00.
// 야간 차단이 잘못되면 사용자 수면 시간에 알림톡 발송 → 신뢰 타격 + 법규 위반.
describe("isAlimtalkQuietHours (정통망법 제50조의5)", () => {
  // ━━━ 정상 시간대 (08:00 ~ 20:59 KST) — 발송 가능 ━━━
  it("KST 09:00 (UTC 00:00) → false", () => {
    const utc = new Date("2026-04-27T00:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(false);
  });
  it("KST 12:00 정오 (UTC 03:00) → false", () => {
    const utc = new Date("2026-04-27T03:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(false);
  });
  it("KST 16:00 alert-dispatch cron 시점 (UTC 07:00) → false", () => {
    const utc = new Date("2026-04-27T07:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(false);
  });
  it("KST 20:59 직전 (UTC 11:59) → false", () => {
    const utc = new Date("2026-04-27T11:59:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(false);
  });

  // ━━━ 야간 시작 21:00 KST 경계 ━━━
  it("KST 21:00 시작 (UTC 12:00) → true", () => {
    const utc = new Date("2026-04-27T12:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(true);
  });
  it("KST 22:00 (UTC 13:00) → true", () => {
    const utc = new Date("2026-04-27T13:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(true);
  });
  it("KST 23:30 (UTC 14:30) → true", () => {
    const utc = new Date("2026-04-27T14:30:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(true);
  });

  // ━━━ 자정 넘어가는 KST 0~7시 ━━━
  it("KST 00:00 자정 (UTC 15:00 전날) → true", () => {
    const utc = new Date("2026-04-26T15:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(true);
  });
  it("KST 03:00 (UTC 18:00 전날) → true", () => {
    const utc = new Date("2026-04-26T18:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(true);
  });
  it("KST 07:59 직전 (UTC 22:59 전날) → true", () => {
    const utc = new Date("2026-04-26T22:59:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(true);
  });

  // ━━━ 야간 종료 08:00 KST 경계 ━━━
  it("KST 08:00 종료 (UTC 23:00 전날) → false", () => {
    const utc = new Date("2026-04-26T23:00:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(false);
  });
  it("KST 08:01 (UTC 23:01 전날) → false", () => {
    const utc = new Date("2026-04-26T23:01:00Z");
    expect(isAlimtalkQuietHours(utc)).toBe(false);
  });

  // ━━━ 인자 없이 호출 시 현재 시각 사용 (런타임 동작 확인) ━━━
  it("인자 없이 호출 시 현재 시각으로 판정", () => {
    const result = isAlimtalkQuietHours();
    expect(typeof result).toBe("boolean");
  });
});
