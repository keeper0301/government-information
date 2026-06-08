import { describe, it, expect } from "vitest";
import { decide, type Measurement } from "@/lib/press-ingest/tier-floor-decide";

// tier_floor 학습 decide() 회귀 테스트.
// 핵심: high→mid 완화는 mid 표본이 충분할 때만 (코드리뷰 P1 2026-06-08).

// 측정값 기본 0 + override 헬퍼
function m(over: Partial<Measurement> = {}): Measurement {
  return {
    midRevokedCount: 0,
    midDecidedCount: 0,
    midRevokeRatePct: 0,
    lowConfirmedCount: 0,
    lowDecidedCount: 0,
    lowConfirmRatePct: 0,
    ...over,
  };
}

describe("press-confidence-tune decide()", () => {
  it("데이터 부족(mid<10 AND low<5) — floor 유지", () => {
    const d = decide("high", m({ midDecidedCount: 3, lowDecidedCount: 2 }));
    expect(d.sufficient).toBe(false);
    expect(d.next).toBe("high");
  });

  it("⭐ high + low 5건만(mid 0건) — mid 완화 보류, high 유지", () => {
    // finding 시나리오: low_decided=5(충분), low_confirm=40%(확장 미달), mid_decided=0.
    // 과거엔 3순위 default 가 high→mid 로 완화했으나, 이제 mid 표본 부족이라 보류.
    const d = decide(
      "high",
      m({ lowDecidedCount: 5, lowConfirmRatePct: 40, midDecidedCount: 0 }),
    );
    expect(d.sufficient).toBe(true);
    expect(d.next).toBe("high"); // 완화되지 않음
    expect(d.reason).toContain("mid 완화 보류");
  });

  it("high + mid 표본 충분(10건, 회수율 안전) — high→mid 정상 완화", () => {
    const d = decide(
      "high",
      m({ midDecidedCount: 10, midRevokeRatePct: 2, lowDecidedCount: 5, lowConfirmRatePct: 40 }),
    );
    expect(d.next).toBe("mid");
    expect(d.target).toBe("mid");
  });

  it("강화 방향 low→mid 는 mid 표본 없어도 동작(보수적이라 안전)", () => {
    // current='low' 에서 mid 로 가는 건 강화. 가드 대상 아님.
    const d = decide("low", m({ lowDecidedCount: 5, lowConfirmRatePct: 40 }));
    expect(d.next).toBe("mid");
  });

  it("1순위: mid 회수율 위험(>5%) — high 안전 강화", () => {
    const d = decide("mid", m({ midDecidedCount: 10, midRevokeRatePct: 8 }));
    expect(d.target).toBe("high");
    expect(d.next).toBe("high");
  });

  it("2순위: low confirm 비율 높음(>50%) — low 확장", () => {
    const d = decide("mid", m({ lowDecidedCount: 5, lowConfirmRatePct: 60 }));
    expect(d.target).toBe("low");
    expect(d.next).toBe("low");
  });
});
