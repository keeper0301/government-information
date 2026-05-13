import { describe, expect, it, vi } from "vitest";
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
  // Task 8 (2026-05-08) — low tier 큐 baseline 정상 (적극 모드에서는 거의 0)
  pressLowTierBacklog: 0,
  // 2026-05-12 — null = OAuth 미연결 (alert X). 만료 임박 케이스는 별도 테스트에서.
  instagramTokenExpiresInDays: null,
  // 2026-05-12 — null = 네이버 cookies 미업로드 (alert X). 만료 임박 케이스는 별도 테스트.
  naverCookiesExpiresInDays: null,
  // 2026-05-14 — baseline 5건 (정상, alert X). 0건 케이스는 별도 테스트.
  policyInflow24h: 5,
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

describe("checkThresholds — 정상 신호 (cron 노쇼 진단)", () => {
  it("모든 신호 정상 → 빈 배열 반환 (cron 본문이 alert 0 흐름 진입)", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      // 모든 Phase 1 신호도 정상
      newsBacklogTotal: 100,
      pressPending: 5,
      pressLastClassifyHours: 6,
      enrichPermanentSkip: 50,
    });
    expect(alerts).toEqual([]);
  });
});

describe("checkThresholds — boundary precision", () => {
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("press_pending = 9 → 발화 안 함 (정확히 floor 미만)", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressPending: 9 });
    expect(alerts.find((a) => a.key === "press_pending")).toBeUndefined();
  });

  it("press_pending = 10 → 발화 (정확히 floor 도달)", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressPending: 10 });
    expect(alerts.find((a) => a.key === "press_pending")).toBeDefined();
  });

  it("enrich_stuck = 99 → 발화 안 함, 100 → 발화 (boundary)", () => {
    const a99 = checkThresholds({ ...ACTIVE, enrichPermanentSkip: 99 });
    const a100 = checkThresholds({ ...ACTIVE, enrichPermanentSkip: 100 });
    expect(a99.find((x) => x.key === "enrich_stuck")).toBeUndefined();
    expect(a100.find((x) => x.key === "enrich_stuck")).toBeDefined();
  });

  it("press_no_show = 999 (admin_actions 흔적 자체가 없는 운영 초기) → 발화", () => {
    // health-check.ts 가 흔적 없을 때 999 fallback — 매번 발화하는 운영 초기 패턴 방지
    // 검증용. 실제 운영 시 false positive 면 PRESS_NO_SHOW_ALERT_HOURS env 로 조정.
    const alerts = checkThresholds({ ...ACTIVE, pressLastClassifyHours: 999 });
    expect(alerts.find((a) => a.key === "press_no_show")).toBeDefined();
  });
});

describe("checkThresholds — recommendation 일관성", () => {
  // 사장님 SMS 보고 즉시 hot-fix 액션 → 모든 alert 가 recommendation 1줄 가져야 함.
  // 새 alert 추가 시 recommendation 누락 방지.
  it("alert 발화하는 모든 종류가 recommendation 1줄 보유 (사장님 즉시 액션)", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      // 의도적으로 모두 임계 초과
      signups24h: 0,
      active7dAny: 0,
      failed24h: 1,
      cronFailures24h: 5,
      newsBacklogTotal: 5000,
      pressPending: 50,
      pressLastClassifyHours: 100,
      enrichPermanentSkip: 500,
      // Task 8 추가: low tier 큐도 임계 초과
      pressLowTierBacklog: 50,
    });
    // 8 alert key 모두 발화
    expect(alerts).toHaveLength(8);
    for (const a of alerts) {
      expect(a.recommendation).toBeTruthy();
      expect(a.recommendation!.length).toBeGreaterThan(10);
    }
  });

  it("low_activity recommendation 에 funnel 진단 진입점 포함", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 0,
      active7dAny: 0,
    });
    const a = alerts.find((x) => x.key === "low_activity");
    expect(a?.recommendation).toContain("/admin/insights");
  });

  it("payment_fail recommendation 에 토스 콘솔 안내 포함", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      failed24h: 2,
    });
    const a = alerts.find((x) => x.key === "payment_fail");
    expect(a?.recommendation).toContain("토스");
  });
});

describe("checkThresholds — multi-alert 시나리오", () => {
  // 실제 운영 사고 — 여러 임계치 동시 초과. SMS 1통에 다 묶여 발송.
  it("news_backlog + press_no_show + enrich_stuck 동시 초과 → 3건 alert 동시 반환", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      newsBacklogTotal: 14781, // 메모리에 적힌 실제 backlog 시나리오
      pressLastClassifyHours: 36,
      enrichPermanentSkip: 200,
    });
    const keys = alerts.map((a) => a.key);
    expect(keys).toContain("news_backlog");
    expect(keys).toContain("press_no_show");
    expect(keys).toContain("enrich_stuck");
    expect(alerts).toHaveLength(3);
  });

  it("low_activity + 다른 alert 동시 발화 — 둘 다 SMS 에 노출", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 0,
      active7dAny: 1,
      newsBacklogTotal: 2000,
    });
    expect(alerts.find((a) => a.key === "low_activity")).toBeDefined();
    expect(alerts.find((a) => a.key === "news_backlog")).toBeDefined();
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
    expect(a?.recommendation).toContain("OPENAI_API_KEY");
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

describe("checkThresholds — Phase 1 추가: press_low_tier_backlog", () => {
  // 트래픽 부족 가드 차단 위해 signups·active 채워서 low tier alert 만 검증
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("low tier 큐 10+ → press_low_tier alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressLowTierBacklog: 10 });
    const a = alerts.find((x) => x.key === "press_low_tier");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("AUTO_CONFIRM_TIER_FLOOR");
  });

  it("low tier 9 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressLowTierBacklog: 9 });
    expect(alerts.find((a) => a.key === "press_low_tier")).toBeUndefined();
  });
});

describe("checkThresholds — 2026-05-14: policy_inflow_zero", () => {
  // 트래픽 가드 차단 위해 signups·active 채움. policy inflow alert 만 검증.
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  // KST 변환 = Date.now() + 9h. fake time 의 UTC 자체가 평일이어야 KST 도 평일.
  // 정오 (UTC 03:00) 으로 fix — KST 12:00, day-boundary 사고 회피.
  const KST_WEDNESDAY = new Date("2026-05-13T03:00:00Z"); // KST 수요일 12:00
  const KST_SATURDAY = new Date("2026-05-16T03:00:00Z"); // KST 토요일 12:00
  const KST_SUNDAY = new Date("2026-05-17T03:00:00Z"); // KST 일요일 12:00

  it("평일 + inflow 0 → policy_inflow_zero alert + recommendation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({ ...ACTIVE, policyInflow24h: 0 });
      const a = alerts.find((x) => x.key === "policy_inflow_zero");
      expect(a).toBeDefined();
      expect(a?.message).toContain("0건");
      expect(a?.recommendation).toContain("press-ingest");
    } finally {
      vi.useRealTimers();
    }
  });

  it("평일 + inflow 1 → 발화 안 함 (boundary, POLICY_INFLOW_FLOOR=1 기본)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({ ...ACTIVE, policyInflow24h: 1 });
      expect(alerts.find((a) => a.key === "policy_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("평일 + inflow 50 → 발화 안 함 (정상 운영)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({ ...ACTIVE, policyInflow24h: 50 });
      expect(alerts.find((a) => a.key === "policy_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("토요일 + inflow 0 → 발화 안 함 (주말 skip — SMS noise 차단)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_SATURDAY);
    try {
      const alerts = checkThresholds({ ...ACTIVE, policyInflow24h: 0 });
      expect(alerts.find((a) => a.key === "policy_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("일요일 + inflow 0 → 발화 안 함 (주말 skip)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_SUNDAY);
    try {
      const alerts = checkThresholds({ ...ACTIVE, policyInflow24h: 0 });
      expect(alerts.find((a) => a.key === "policy_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
