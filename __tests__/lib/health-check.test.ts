import { describe, expect, it } from "vitest";
import { checkThresholds, type HealthSignals } from "@/lib/health-check";

const BASE_SIGNALS: HealthSignals = {
  signups24h: 0,
  active7d: 1,
  active7dAny: 1,
  failed24h: 0,
  cronFailures24h: 0,
  deliveryFailures24h: 0,
  // Phase 1 자동 진단 baseline — 모두 정상 (alert 발송 안 됨)
  newsBacklogTotal: 0,
  pressPending: 0,
  pressLastClassifyHours: 1,
  enrichPermanentSkip: 0,
};

describe("checkThresholds — low_activity 가드", () => {
  it("24h 가입 0 + 활성(확장) 5명 미만 → low_activity alert 발송", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 0,
      active7dAny: 1,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe("low_activity");
    expect(alerts[0].message).toContain("7d 활성(가입+로그인) 1명");
  });

  it("24h 가입 1+ 면 low_activity 발송 안 함 — 신규 유입 자체가 정상 신호", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 1,
      active7dAny: 1,
    });
    expect(alerts.find((a) => a.key === "low_activity")).toBeUndefined();
  });

  it("active7dAny 5명 이상이면 low_activity 발송 안 함 — 충분한 활동", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 0,
      active7dAny: 5,
    });
    expect(alerts.find((a) => a.key === "low_activity")).toBeUndefined();
  });

  it("active7d (좁음) 만 1명, active7dAny (확장) 5명 이상 → 발송 안 함 — false positive 방지", () => {
    // 시나리오: 사장님 본인만 로그인 (active7d=1) BUT 7d 안에 신규 가입 4명 추가 →
    // active7dAny=5 → keepioo 운영 초기 정상 패턴, alert 안 떠야 함.
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 0,
      active7d: 1,
      active7dAny: 5,
    });
    expect(alerts.find((a) => a.key === "low_activity")).toBeUndefined();
  });
});

describe("checkThresholds — 다른 임계치", () => {
  it("결제 해지 24h 1건 이상 → payment_fail alert", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5, // low_activity 차단
      active7dAny: 10,
      failed24h: 1,
    });
    expect(alerts.find((a) => a.key === "payment_fail")).toBeDefined();
  });

  it("cron 실패 24h 임계치 (기본 3) 미만이면 cron_fail alert 안 발송", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      cronFailures24h: 2,
    });
    expect(alerts.find((a) => a.key === "cron_fail")).toBeUndefined();
  });

  it("cron 실패 24h 임계치 이상이면 cron_fail alert 발송", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      cronFailures24h: 3,
    });
    expect(alerts.find((a) => a.key === "cron_fail")).toBeDefined();
  });
});

describe("checkThresholds — Phase 1 자동 진단", () => {
  // 트래픽 부족 가드 차단 위해 signups·active 채워서 다른 alert 만 검증
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("news 미분류 backlog 1000+ → news_backlog alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, newsBacklogTotal: 1000 });
    const a = alerts.find((x) => x.key === "news_backlog");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("news_classify_run");
  });

  it("news backlog 1000 미만이면 alert 안 발송", () => {
    const alerts = checkThresholds({ ...ACTIVE, newsBacklogTotal: 999 });
    expect(alerts.find((a) => a.key === "news_backlog")).toBeUndefined();
  });

  it("press_ingest_candidates pending 10+ → press_pending alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressPending: 10 });
    const a = alerts.find((x) => x.key === "press_pending");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("/admin/press-ingest");
  });

  it("press_l2_classify 36h 노쇼 → press_no_show alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressLastClassifyHours: 36 });
    const a = alerts.find((x) => x.key === "press_no_show");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("ANTHROPIC_API_KEY");
  });

  it("press_l2_classify 35h 이내면 alert 안 발송", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressLastClassifyHours: 35 });
    expect(alerts.find((a) => a.key === "press_no_show")).toBeUndefined();
  });

  it("enrich 영구 skip 100+ → enrich_stuck alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, enrichPermanentSkip: 100 });
    const a = alerts.find((x) => x.key === "enrich_stuck");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("/admin/enrich-detail");
  });
});
