import { describe, expect, it, vi } from "vitest";
import { checkThresholds, type HealthSignals } from "@/lib/health-check";

const BASE_SIGNALS: HealthSignals = {
  signups24h: 0,
  active7d: 1,
  active7dAny: 1,
  failed24h: 0,
  cronFailures24h: 0,
  deliveryFailures24h: 0,
  rateLimitMaxCount: 0,
  rateLimitHotBuckets: [],
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
  // 2026-05-14 — welfare/loan 분리 baseline (정상, alert X).
  welfareInflow24h: 3,
  loanInflow24h: 2,
  // 2026-05-14 — loan 마지막 inflow 1h 전 (정상, alert X). 48h+ 케이스 별도 테스트.
  loanLastInflowHours: 1,
  // 2026-05-14 — 네이버 publish baseline (정상, alert X). 사고 케이스 별도 테스트.
  naverPublishAttempts24h: 5,
  naverPublishFails24h: 0,
  naverPublishEligiblePending: 10,
  // 2026-05-14 — baseline 1h (방금 실행됨, alert X). 36h+ 케이스는 별도 테스트.
  collectLastRunHours: 1,
  // 2026-05-17 — baseline 0 (전 시·군 정상, alert X). 10+ 케이스는 별도 테스트.
  localPressStaleCities: 0,
  // 2026-06-09 — baseline 0 (collector 고장 없음, alert X). ≥1 케이스 별도 테스트.
  localPressBrokenCollectors: 0,
  localPressCollectorDetail: "",
  // 2026-06-10 — baseline 0 (insert-stop 없음, alert X). ≥1 케이스 별도 테스트.
  localPressInsertStopped: 0,
  localPressInsertStopDetail: "",
  // 2026-06-10 — baseline 0 (cadence 급락 없음, alert X). ≥1 케이스 별도 테스트.
  localPressCadenceDrops: 0,
  localPressCadenceDetail: "",
  // 2026-05-30 — baseline 0 (silent fallback 없음, alert X). ≥1 케이스 별도 테스트.
  localPressNullDateCities: 0,
  // 2026-05-30 — baseline 0.3 (news 비중 정상, alert X). ≥0.6 케이스 별도 테스트.
  newsRatio: 0.3,
  // 2026-05-31 — baseline false (백필 미달 or review mode off, alert X). true 별도 테스트.
  adsenseReadyToDisable: false,
  // 2026-05-31 — baseline null (ENV 미설정 = alert X). 7일/만료 케이스 별도.
  vercelTokenExpiresInDays: null,
  // 2026-05-17 — baseline 1h (방금 발행, alert X). 60h+ 케이스는 별도 테스트.
  blogPublishStaleHours: 1,
  // 2026-06-07 — baseline 3 (매주 학습 cron 정상 발화, alert X). 0건 케이스 별도 테스트.
  selfLearningCronRunsLast7d: 3,
  // 2026-06-11 — baseline 90 (enrich+백필 후 정상, alert X). <80 케이스 별도 테스트.
  welfareInsightCoveragePct: 90,
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

describe("checkThresholds — collector 고장(자가치유 감지 확장)", () => {
  it("고장 0건 → alert 없음", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      localPressBrokenCollectors: 0,
    });
    expect(
      alerts.find((a) => a.key === "local_press_collector_broken"),
    ).toBeUndefined();
  });

  it("고장 ≥1 → local_press_collector_broken alert + detail 을 recommendation 으로", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      localPressBrokenCollectors: 2,
      localPressCollectorDetail: "🩺 의정부 — 목록 매칭 0건\n  제안: listSelectors 재확인",
    });
    const a = alerts.find((x) => x.key === "local_press_collector_broken");
    expect(a).toBeDefined();
    expect(a?.message).toContain("2건");
    expect(a?.recommendation).toContain("의정부");
  });

  it("insert-stop 0건 → alert 없음", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      localPressInsertStopped: 0,
    });
    expect(
      alerts.find((a) => a.key === "local_press_insert_stop"),
    ).toBeUndefined();
  });

  it("insert-stop ≥1 → local_press_insert_stop alert + detail recommendation", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      localPressInsertStopped: 3,
      localPressInsertStopDetail: "🔇 강화군 — 최근 5일 목록은 수집되나 신규 0",
    });
    const a = alerts.find((x) => x.key === "local_press_insert_stop");
    expect(a).toBeDefined();
    expect(a?.message).toContain("3건");
    expect(a?.recommendation).toContain("강화군");
  });

  it("cadence 급락 0건 → alert 없음", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      localPressCadenceDrops: 0,
    });
    expect(
      alerts.find((a) => a.key === "local_press_cron_cadence"),
    ).toBeUndefined();
  });

  it("cadence 급락 ≥1 → local_press_cron_cadence alert + detail recommendation", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 5,
      active7dAny: 10,
      localPressCadenceDrops: 2,
      localPressCadenceDetail: "⏱ 의정부 — 최근 0.8회/일 (이전 2회/일 → 급락)",
    });
    const a = alerts.find((x) => x.key === "local_press_cron_cadence");
    expect(a).toBeDefined();
    expect(a?.message).toContain("2건");
    expect(a?.recommendation).toContain("의정부");
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

  it("enrich_stuck = 99 → 발화 안 함, 100 + insight 저하 → 발화 (boundary)", () => {
    const a99 = checkThresholds({ ...ACTIVE, enrichPermanentSkip: 99 });
    const a100 = checkThresholds({
      ...ACTIVE,
      enrichPermanentSkip: 100,
      welfareInsightCoveragePct: 79,
    });
    expect(a99.find((x) => x.key === "enrich_stuck")).toBeUndefined();
    expect(a100.find((x) => x.key === "enrich_stuck")).toBeDefined();
  });

  it("pending 전부가 low-tier 이면 press_pending 중복 alert 는 숨기고 press_low_tier 만 발화", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      pressPending: 32,
      pressLowTierBacklog: 32,
    });
    expect(alerts.find((a) => a.key === "press_pending")).toBeUndefined();
    expect(alerts.find((a) => a.key === "press_low_tier")).toBeDefined();
  });

  it("enrich 영구 skip 누적만 높고 insight 커버리지가 정상권이면 즉시 장애 alert 로 보지 않는다", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      enrichPermanentSkip: 173,
      welfareInsightCoveragePct: 90,
    });
    expect(alerts.find((a) => a.key === "enrich_stuck")).toBeUndefined();
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
      welfareInsightCoveragePct: 79,
      // Task 8 추가: low tier 큐도 임계 초과
      pressLowTierBacklog: 40,
    });
    // 최소 8 alert key — 신규 임계 추가 시 silent regression 방지 (subagent Warning-4 fix)
    expect(alerts.length).toBeGreaterThanOrEqual(8);
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
      welfareInsightCoveragePct: 79,
    });
    const keys = alerts.map((a) => a.key);
    expect(keys).toContain("news_backlog");
    expect(keys).toContain("press_no_show");
    expect(keys).toContain("enrich_stuck");
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });

  it("low_activity + 다른 alert 동시 발화 — 둘 다 SMS 에 노출", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      signups24h: 0,
      active7dAny: 1,
      newsBacklogTotal: 6000, // 5000 floor 초과 (2026-05-14 fix)
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

  it("news 미분류 backlog 5000+ → news_backlog alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, newsBacklogTotal: 5000 });
    const a = alerts.find((x) => x.key === "news_backlog");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("news_classify_run");
  });

  it("news backlog 5000 미만이면 alert 안 발송 (적체 흡수 중 false positive 차단)", () => {
    const alerts = checkThresholds({ ...ACTIVE, newsBacklogTotal: 4999 });
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
    const alerts = checkThresholds({
      ...ACTIVE,
      enrichPermanentSkip: 100,
      welfareInsightCoveragePct: 79,
    });
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
      expect(a?.message).toContain("정책 inflow");
      expect(a?.message).toContain("collector + press-ingest 합산");
      expect(a?.recommendation).toContain("press-ingest");
    } finally {
      vi.useRealTimers();
    }
  });

  it("평일 + inflow 0 + press_no_show 동시 → policy_inflow_zero skip (중복 단일화)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      // pressLastClassifyHours >= 36 → press_no_show 발화 중
      const alerts = checkThresholds({
        ...ACTIVE,
        policyInflow24h: 0,
        pressLastClassifyHours: 40,
      });
      // press_no_show 는 발화, policy_inflow_zero 는 SMS noise 차단 위해 skip
      expect(alerts.find((a) => a.key === "press_no_show")).toBeDefined();
      expect(alerts.find((a) => a.key === "policy_inflow_zero")).toBeUndefined();
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

describe("checkThresholds — 2026-05-14: collect_no_show", () => {
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("collectLastRunHours 36+ → collect_no_show alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, collectLastRunHours: 40 });
    const a = alerts.find((x) => x.key === "collect_no_show");
    expect(a).toBeDefined();
    expect(a?.message).toContain("collect");
    expect(a?.recommendation).toContain("collect.yml");
  });

  it("collectLastRunHours 35 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, collectLastRunHours: 35 });
    expect(alerts.find((a) => a.key === "collect_no_show")).toBeUndefined();
  });

  it("collectLastRunHours 999 (흔적 없음) → 반드시 alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, collectLastRunHours: 999 });
    expect(alerts.find((a) => a.key === "collect_no_show")).toBeDefined();
  });
});

describe("checkThresholds — 2026-05-14: delivery_fail (메타 사고)", () => {
  // 12개 임계치 다 정상이어도 alert 자체가 사장님께 안 가면 무용지물.
  // alert_deliveries status='failed' 누적 = SMS·이메일 인프라 사고 자동 감지.
  // 임계 5 (subagent Warning-1 fix — alert-dispatch retry 없음, buffer 1단계 위)
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("deliveryFailures24h 5+ → delivery_fail alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, deliveryFailures24h: 5 });
    const a = alerts.find((x) => x.key === "delivery_fail");
    expect(a).toBeDefined();
    expect(a?.message).toContain("알림 발송 실패 5건");
    // recommendation 에 실제 진단 UI (/admin/alimtalk) 진입점 포함 (subagent Critical-1 fix)
    expect(a?.recommendation).toContain("/admin/alimtalk");
    // 외부 콘솔 진단 진입점 (Solapi·Resend) 도 포함
    expect(a?.recommendation).toContain("Solapi");
    expect(a?.recommendation).toContain("Resend");
    // 의도적 공존 안내 (kakao_high_failure 와 동시 발화 가능 — subagent Critical-2 fix)
    expect(a?.recommendation).toContain("kakao_high_failure");
  });

  it("deliveryFailures24h 4 → 발화 안 함 (boundary, 기본 임계 5)", () => {
    const alerts = checkThresholds({ ...ACTIVE, deliveryFailures24h: 4 });
    expect(alerts.find((a) => a.key === "delivery_fail")).toBeUndefined();
  });

  it("deliveryFailures24h 0 (정상 운영) → 발화 안 함", () => {
    const alerts = checkThresholds({ ...ACTIVE, deliveryFailures24h: 0 });
    expect(alerts.find((a) => a.key === "delivery_fail")).toBeUndefined();
  });
});

describe("checkThresholds — 2026-05-14: loan_inflow_zero (단독 노쇼)", () => {
  // 데이터 기반 발견 (5/14): welfare 7 + loan 0 = 합산 7 → policy_inflow_zero 임계 통과
  // → loan 사고 가려짐. loan-only 출처 (kinfa 등) 노쇼 진단 사각지대였음.
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  // 평일 (KST 수요일 12:00)
  const KST_WEDNESDAY = new Date("2026-05-13T03:00:00Z");
  const KST_SATURDAY = new Date("2026-05-16T03:00:00Z");

  it("평일 + welfare 정상 + loan 48h 노쇼 → loan_inflow_zero alert + recommendation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({
        ...ACTIVE,
        welfareInflow24h: 7, // 정상
        loanInflow24h: 0,
        loanLastInflowHours: 48, // boundary 도달
        // policyInflow24h 는 합산 7 — policy_inflow_zero 안 발화
        policyInflow24h: 7,
      });
      const a = alerts.find((x) => x.key === "loan_inflow_zero");
      expect(a).toBeDefined();
      expect(a?.message).toContain("loan 단독 노쇼");
      expect(a?.message).toContain("welfare 7건은 정상");
      expect(a?.recommendation).toContain("kinfa");
      expect(a?.recommendation).toContain("collect.yml");
      // policy_inflow_zero 는 합산 통과로 발화 안 함 (단일화 확인)
      expect(alerts.find((x) => x.key === "policy_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("평일 + loan 47h → 발화 안 함 (boundary 미달)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({
        ...ACTIVE,
        welfareInflow24h: 7,
        loanInflow24h: 0,
        loanLastInflowHours: 47,
        policyInflow24h: 7,
      });
      expect(alerts.find((a) => a.key === "loan_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("welfare 0 + loan 0 동시 → policy_inflow_zero 가 우선 (loan_inflow_zero 단일화)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({
        ...ACTIVE,
        welfareInflow24h: 0, // 함께 노쇼 — 둘 다 사고 = policy_inflow_zero
        loanInflow24h: 0,
        loanLastInflowHours: 100,
        policyInflow24h: 0,
      });
      // welfare 가 0 이면 (welfare 정상 조건 충족 X) loan_inflow_zero 발화 안 함
      expect(alerts.find((a) => a.key === "loan_inflow_zero")).toBeUndefined();
      // 대신 policy_inflow_zero 가 합산 0 으로 잡음
      expect(alerts.find((a) => a.key === "policy_inflow_zero")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("주말 + welfare 정상 + loan 48h → 발화 안 함 (주말 skip 일관)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_SATURDAY);
    try {
      const alerts = checkThresholds({
        ...ACTIVE,
        welfareInflow24h: 7,
        loanInflow24h: 0,
        loanLastInflowHours: 48,
        policyInflow24h: 7,
      });
      expect(alerts.find((a) => a.key === "loan_inflow_zero")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("welfare 1 (boundary) + loan 48h → 발화 (welfare 정상 boundary 검증)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({
        ...ACTIVE,
        welfareInflow24h: 1,
        loanInflow24h: 0,
        loanLastInflowHours: 48,
        policyInflow24h: 1,
      });
      expect(alerts.find((a) => a.key === "loan_inflow_zero")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("loanLastInflowHours 999 (흔적 없음 운영 초기) → welfare 정상 시 발화", () => {
    vi.useFakeTimers();
    vi.setSystemTime(KST_WEDNESDAY);
    try {
      const alerts = checkThresholds({
        ...ACTIVE,
        welfareInflow24h: 5,
        loanInflow24h: 0,
        loanLastInflowHours: 999,
        policyInflow24h: 5,
      });
      expect(alerts.find((a) => a.key === "loan_inflow_zero")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("checkThresholds — 2026-05-14: naver_publish_failure (codex spec)", () => {
  // 5/13 사고 baseline: attempts 1,734 / fails 1,734 / pending 68 → 발화 보장.
  // 셋 다 충족 시만 발화: attempts >= 20 AND fail_rate >= 0.9 AND pending > 0
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("attempts 20 + fails 19 (95%) + pending 10 → naver_publish_failure 발화", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      naverPublishAttempts24h: 20,
      naverPublishFails24h: 19,
      naverPublishEligiblePending: 10,
    });
    const a = alerts.find((x) => x.key === "naver_publish_failure");
    expect(a).toBeDefined();
    expect(a?.message).toContain("95%");
    expect(a?.recommendation).toContain("runner");
  });

  it("attempts 19 (FLOOR 미달) → 발화 안 함 (표본 부족 가드)", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      naverPublishAttempts24h: 19,
      naverPublishFails24h: 19,
      naverPublishEligiblePending: 10,
    });
    expect(alerts.find((a) => a.key === "naver_publish_failure")).toBeUndefined();
  });

  it("fail_rate 0.85 (90% 미달) → 발화 안 함 (강도 가드)", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      naverPublishAttempts24h: 100,
      naverPublishFails24h: 85,
      naverPublishEligiblePending: 10,
    });
    expect(alerts.find((a) => a.key === "naver_publish_failure")).toBeUndefined();
  });

  it("eligible_pending 0 → 발화 안 함 (큐 비어있음 = 정상)", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      naverPublishAttempts24h: 100,
      naverPublishFails24h: 100,
      naverPublishEligiblePending: 0,
    });
    expect(alerts.find((a) => a.key === "naver_publish_failure")).toBeUndefined();
  });

  it("attempts 0 (PC 미가동) → 발화 안 함 (false positive 차단)", () => {
    const alerts = checkThresholds({
      ...ACTIVE,
      naverPublishAttempts24h: 0,
      naverPublishFails24h: 0,
      naverPublishEligiblePending: 50,
    });
    expect(alerts.find((a) => a.key === "naver_publish_failure")).toBeUndefined();
  });
});

describe("checkThresholds — 2026-05-17: local_press_stale", () => {
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("localPressStaleCities 10+ → local_press_stale alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, localPressStaleCities: 10 });
    const a = alerts.find((x) => x.key === "local_press_stale");
    expect(a).toBeDefined();
    expect(a?.message).toContain("stale 10건");
    expect(a?.recommendation).toContain("/admin/autonomous");
  });

  it("localPressStaleCities 9 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, localPressStaleCities: 9 });
    expect(alerts.find((a) => a.key === "local_press_stale")).toBeUndefined();
  });

  it("localPressNullDateCities 1+ → local_press_null_date alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, localPressNullDateCities: 1 });
    expect(alerts.find((a) => a.key === "local_press_null_date")).toBeTruthy();
  });

  it("localPressNullDateCities 0 → 발화 안 함 (정상)", () => {
    const alerts = checkThresholds({ ...ACTIVE, localPressNullDateCities: 0 });
    expect(alerts.find((a) => a.key === "local_press_null_date")).toBeFalsy();
  });

  it("newsRatio 0.6+ → news_ratio_high alert (Google scaled content 정책)", () => {
    const alerts = checkThresholds({ ...ACTIVE, newsRatio: 0.6 });
    expect(alerts.find((a) => a.key === "news_ratio_high")).toBeTruthy();
  });

  it("newsRatio 0.59 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, newsRatio: 0.59 });
    expect(alerts.find((a) => a.key === "news_ratio_high")).toBeFalsy();
  });

  it("adsenseReadyToDisable true → adsense_ready_to_disable alert (AdSense Phase A)", () => {
    const alerts = checkThresholds({ ...ACTIVE, adsenseReadyToDisable: true });
    expect(alerts.find((a) => a.key === "adsense_ready_to_disable")).toBeTruthy();
  });

  it("adsenseReadyToDisable false → 발화 안 함 (정상, 미달 or off)", () => {
    const alerts = checkThresholds({ ...ACTIVE, adsenseReadyToDisable: false });
    expect(alerts.find((a) => a.key === "adsense_ready_to_disable")).toBeFalsy();
  });

  it("vercelTokenExpiresInDays 7 → vercel_token_expiring alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, vercelTokenExpiresInDays: 7 });
    expect(alerts.find((a) => a.key === "vercel_token_expiring")).toBeTruthy();
  });

  it("vercelTokenExpiresInDays -3 (이미 만료) → vercel_token_expiring alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, vercelTokenExpiresInDays: -3 });
    const a = alerts.find((x) => x.key === "vercel_token_expiring");
    expect(a).toBeTruthy();
    expect(a?.message).toContain("이미 만료");
  });

  it("vercelTokenExpiresInDays 8 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, vercelTokenExpiresInDays: 8 });
    expect(alerts.find((a) => a.key === "vercel_token_expiring")).toBeFalsy();
  });

  it("vercelTokenExpiresInDays null (ENV 미설정) → 발화 안 함", () => {
    const alerts = checkThresholds({ ...ACTIVE, vercelTokenExpiresInDays: null });
    expect(alerts.find((a) => a.key === "vercel_token_expiring")).toBeFalsy();
  });

  it("localPressStaleCities 0 → 발화 안 함 (정상)", () => {
    const alerts = checkThresholds({ ...ACTIVE, localPressStaleCities: 0 });
    expect(alerts.find((a) => a.key === "local_press_stale")).toBeUndefined();
  });
});

describe("checkThresholds — 2026-05-17: blog_publish_stalled", () => {
  const ACTIVE: HealthSignals = {
    ...BASE_SIGNALS,
    signups24h: 5,
    active7dAny: 10,
  };

  it("blogPublishStaleHours 60+ → blog_publish_stalled alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, blogPublishStaleHours: 60 });
    const a = alerts.find((x) => x.key === "blog_publish_stalled");
    expect(a).toBeDefined();
    expect(a?.message).toContain("60h+ 무발행");
    expect(a?.recommendation).toContain("Spending cap");
    expect(a?.recommendation).toContain("publish-blog");
  });

  it("blogPublishStaleHours 59 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, blogPublishStaleHours: 59 });
    expect(alerts.find((a) => a.key === "blog_publish_stalled")).toBeUndefined();
  });

  it("blogPublishStaleHours 9999 (발행 이력 없음) → 반드시 alert", () => {
    const alerts = checkThresholds({ ...ACTIVE, blogPublishStaleHours: 9999 });
    expect(alerts.find((a) => a.key === "blog_publish_stalled")).toBeDefined();
  });
});

describe("checkThresholds — self_learning_cron_idle (P3 #6)", () => {
  it("env 활성(과거 날짜) + 학습 cron 7d 0건 → alert", () => {
    vi.stubEnv("SELF_LEARNING_CRON_ALERT_AFTER", "2026-01-01");
    const alerts = checkThresholds({ ...BASE_SIGNALS, selfLearningCronRunsLast7d: 0 });
    expect(alerts.find((a) => a.key === "self_learning_cron_idle")).toBeDefined();
    vi.unstubAllEnvs();
  });

  it("env 미설정 → 0건이어도 alert 안 함 (안전 기본값, 등록 전 오탐 0)", () => {
    vi.stubEnv("SELF_LEARNING_CRON_ALERT_AFTER", "");
    const alerts = checkThresholds({ ...BASE_SIGNALS, selfLearningCronRunsLast7d: 0 });
    expect(alerts.find((a) => a.key === "self_learning_cron_idle")).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("env 활성 + 정상 발화(3건) → alert 안 함", () => {
    vi.stubEnv("SELF_LEARNING_CRON_ALERT_AFTER", "2026-01-01");
    const alerts = checkThresholds({ ...BASE_SIGNALS, selfLearningCronRunsLast7d: 3 });
    expect(alerts.find((a) => a.key === "self_learning_cron_idle")).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("checkThresholds — welfare insight 커버리지 회귀 가드", () => {
  it("커버리지 80% 미만 → welfare_insight_coverage_low alert 발송", () => {
    const alerts = checkThresholds({ ...BASE_SIGNALS, welfareInsightCoveragePct: 65 });
    expect(alerts.find((a) => a.key === "welfare_insight_coverage_low")).toBeDefined();
  });

  it("커버리지 80% 이상 → alert 안 함", () => {
    const alerts = checkThresholds({ ...BASE_SIGNALS, welfareInsightCoveragePct: 90 });
    expect(alerts.find((a) => a.key === "welfare_insight_coverage_low")).toBeUndefined();
  });

  it("커버리지 floor 경계(정확히 80%) → alert 안 함", () => {
    const alerts = checkThresholds({ ...BASE_SIGNALS, welfareInsightCoveragePct: 80 });
    expect(alerts.find((a) => a.key === "welfare_insight_coverage_low")).toBeUndefined();
  });
});

describe("checkThresholds — rate_limit_abuse", () => {
  it("rate limit bucket count 가 floor 이상이면 alert", () => {
    const alerts = checkThresholds({
      ...BASE_SIGNALS,
      rateLimitMaxCount: 180,
      rateLimitHotBuckets: [
        {
          bucket: "chatbot:ip:*",
          bucketClass: "chatbot",
          windowMinute: 123,
          count: 180,
        },
      ],
    });
    const a = alerts.find((x) => x.key === "rate_limit_abuse");
    expect(a).toBeDefined();
    expect(a?.message).toContain("180회/분");
    expect(a?.message).toContain("chatbot:ip:*");
    expect(a?.recommendation).toContain("rate_limit_status");
  });

  it("rate limit bucket count 가 floor 미만이면 alert 안 함", () => {
    const alerts = checkThresholds({ ...BASE_SIGNALS, rateLimitMaxCount: 179 });
    expect(alerts.find((a) => a.key === "rate_limit_abuse")).toBeUndefined();
  });
});
