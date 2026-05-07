import { describe, expect, it } from "vitest";
import { formatDigestMessage } from "@/lib/notifications/daily-digest";

describe("formatDigestMessage", () => {
  it("핵심 KPI 5개 모두 포함 (사장님 빠른 인지)", () => {
    const message = formatDigestMessage({
      signups24h: 3,
      newPolicies24h: 47,
      active7d: 12,
      pressAutoConfirmed24h: 28,
      newsAutoHidden24h: 5,
      dedupeAutoConfirmed24h: 2,
    });
    expect(message).toContain("[keepioo");
    expect(message).toContain("가입 3");
    expect(message).toContain("활성 12");
    expect(message).toContain("신규 정책 47");
    expect(message).toContain("보도자료 28");
    expect(message).toContain("뉴스hide 5");
    expect(message).toContain("dedupe 2");
  });

  it("어드민 health 링크 자동 포함 (사장님 디테일 빠른 진입)", () => {
    const message = formatDigestMessage({
      signups24h: 0,
      newPolicies24h: 0,
      active7d: 0,
      pressAutoConfirmed24h: 0,
      newsAutoHidden24h: 0,
      dedupeAutoConfirmed24h: 0,
    });
    expect(message).toContain("keepioo.com/admin/health");
  });

  it("0 모두 — 메시지가 깔끔하게 표시 (운영 정상 신호)", () => {
    const message = formatDigestMessage({
      signups24h: 0,
      newPolicies24h: 0,
      active7d: 0,
      pressAutoConfirmed24h: 0,
      newsAutoHidden24h: 0,
      dedupeAutoConfirmed24h: 0,
    });
    expect(message).toContain("가입 0");
    expect(message).toContain("활성 0");
  });

  it("MM/DD 날짜 형식 포함 (어제 데이터 인지 보강)", () => {
    const message = formatDigestMessage({
      signups24h: 1,
      newPolicies24h: 1,
      active7d: 1,
      pressAutoConfirmed24h: 0,
      newsAutoHidden24h: 0,
      dedupeAutoConfirmed24h: 0,
    });
    // [keepioo MM/DD] 패턴
    expect(message).toMatch(/\[keepioo \d{2}\/\d{2}\]/);
  });
});
