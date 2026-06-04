import { describe, expect, it } from "vitest";
import {
  decideAgentAutomation,
  getAgentPolicySummary,
} from "@/lib/autonomous-ops/agent-policy";

describe("decideAgentAutomation", () => {
  it("읽기·감사·품질 점수화 계열은 자동 실행한다", () => {
    expect(
      decideAgentAutomation({
        area: "site_ops",
        action: "health_check",
      }),
    ).toMatchObject({
      mode: "auto_execute",
      risk: "low",
    });
  });

  it("품질 검수 통과 외부 발행은 자동 실행 대상이다", () => {
    expect(
      decideAgentAutomation({
        area: "external_publish",
        action: "content_generate_with_quality_gate",
        externalPublish: true,
        qualityApproved: true,
      }),
    ).toMatchObject({
      mode: "auto_execute",
      risk: "low",
    });
  });

  it("품질 검수 실패 외부 발행은 차단한다", () => {
    expect(
      decideAgentAutomation({
        area: "external_publish",
        action: "content_generate_with_quality_gate",
        externalPublish: true,
        qualityApproved: false,
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "high",
    });
  });

  it("스크래퍼·프롬프트 변경은 PR 모드로 분류한다", () => {
    expect(
      decideAgentAutomation({
        area: "bug_fix",
        action: "scraper_regex_fix",
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "medium",
    });
  });

  it("보안·인증 코드는 PR과 high risk 로 분류한다", () => {
    expect(
      decideAgentAutomation({
        area: "security",
        action: "rls_policy_change",
        touchesAuth: true,
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "high",
    });
  });

  it("검증 미완료 schema 는 허용하되 PR/high 로 보내고 secret·payment 는 관리자 검토로 보낸다", () => {
    expect(
      decideAgentAutomation({
        area: "data",
        action: "apply_migration",
        touchesSchema: true,
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "high",
    });
    expect(
      decideAgentAutomation({
        area: "secrets",
        action: "rotate_token",
        touchesSecrets: true,
      }).mode,
    ).toBe("admin_review");
    expect(
      decideAgentAutomation({
        area: "payments",
        action: "refund",
        touchesPayments: true,
      }).mode,
    ).toBe("admin_review");
  });

  it("운영 DB 비파괴 변경은 테스트와 rollback 이 확인되면 자동 실행한다", () => {
    expect(
      decideAgentAutomation({
        area: "data",
        action: "apply_migration",
        touchesProductionDb: true,
        touchesSchema: true,
        dbChangeKind: "schema_additive",
        migrationTested: true,
        rollbackReady: true,
      }),
    ).toMatchObject({
      mode: "auto_execute",
      risk: "high",
    });
  });

  it("운영 DB 변경은 rollback 준비가 없으면 PR 검증으로 보낸다", () => {
    expect(
      decideAgentAutomation({
        area: "data",
        action: "non_destructive_backfill",
        touchesProductionDb: true,
        dbChangeKind: "non_destructive_backfill",
        migrationTested: true,
        rollbackReady: false,
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "high",
    });
  });

  it("운영 DB 파괴 변경은 명시 허용 후에도 차단한다", () => {
    expect(
      decideAgentAutomation({
        area: "data",
        action: "drop_table",
        touchesProductionDb: true,
        dbChangeKind: "destructive",
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "critical",
    });
  });

  it("파괴 작업은 차단한다", () => {
    expect(
      decideAgentAutomation({
        area: "data",
        action: "delete_rows",
        destructive: true,
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "critical",
    });
  });

  // area === "secrets" 단독 지정 (touchesSecrets 플래그 없이) 도 critical 처리
  it("area === 'secrets' 단독 지정도 관리자 검토로 보낸다", () => {
    expect(
      decideAgentAutomation({
        area: "secrets",
        action: "rotate_token",
      }),
    ).toMatchObject({
      mode: "admin_review",
      risk: "critical",
    });
  });

  // destructive 는 qualityApproved 와 무관하게 가장 먼저 차단
  it("destructive 작업은 qualityApproved=true 여도 차단한다", () => {
    expect(
      decideAgentAutomation({
        area: "external_publish",
        action: "content_generate_with_quality_gate",
        destructive: true,
        qualityApproved: true,
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "critical",
    });
  });

  // destructive 는 AUTO_ACTIONS 자동 실행보다 우선 차단
  it("AUTO_ACTIONS 라도 destructive=true 면 차단한다", () => {
    expect(
      decideAgentAutomation({
        area: "site_ops",
        action: "health_check",
        destructive: true,
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "critical",
    });
  });

  // 분류되지 않은 action 은 보수적으로 review/medium
  it("분류되지 않은 action 은 admin_review/medium 으로 떨어진다", () => {
    expect(
      decideAgentAutomation({
        area: "site_ops",
        action: "unknown_thing",
      }),
    ).toMatchObject({
      mode: "admin_review",
      risk: "medium",
    });
  });

  // 2026-05-18 Phase 6 — Codex 자율 운영 회귀 방어 3종
  it("Phase 6 W0 — codex_diagnose 는 auto_execute (read-only)", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_diagnose",
      }),
    ).toMatchObject({
      mode: "auto_execute",
      risk: "low",
    });
  });

  it("Phase 6 W1 — codex_scraper_fix 는 create_pr (사장님 1 click merge)", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_scraper_fix",
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "medium",
    });
  });

  it("Phase 6 W1 — cron/notification fix 는 create_pr", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_cron_fix",
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "medium",
    });
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_notification_fix",
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "medium",
    });
  });

  it("Phase 6 W1 — blog publish fix 는 create_pr", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_blog_publish_fix",
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "medium",
    });
  });

  it("Phase 6 W1 — schema migration 은 사장님 승인 후 create_pr/high", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_schema_migration",
        touchesSchema: true,
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "high",
    });
  });

  it("Phase 6 W3 — auth/destructive 계열은 PR 생성까지만 critical 로 허용한다", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_auth_fix",
        touchesAuth: true,
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "critical",
    });
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_destructive_plan",
      }),
    ).toMatchObject({
      mode: "create_pr",
      risk: "critical",
    });
  });

  // 2026-06-05 코드리뷰 P2 회귀 방어 — HIGH_RISK_PR_ACTIONS(codex_auth_fix 등) 검사가
  // secrets/payments 게이트보다 먼저 평가돼, secret/payment 를 건드리는 codex_auth_fix 가
  // admin_review 를 우회해 create_pr 로 분류되던 권한 경계 버그. 게이트 순서를 재배열해
  // 차단했고, 우회가 다시 생기지 않도록 고정한다.
  it("codex_auth_fix + touchesSecrets 는 create_pr 가 아니라 admin_review (secrets 우회 차단)", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_auth_fix",
        touchesSecrets: true,
      }),
    ).toMatchObject({
      mode: "admin_review",
      risk: "critical",
    });
  });

  it("codex_auth_fix + touchesPayments 도 admin_review (payments 우회 차단)", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_auth_fix",
        touchesPayments: true,
      }),
    ).toMatchObject({
      mode: "admin_review",
      risk: "critical",
    });
  });

  it("Phase 6 W3 안전망 — destructive=true 실제 실행 요청은 계속 blocked", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_destructive_plan",
        destructive: true,
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "critical",
    });
  });

  it("Phase 6 안전망 — area='agent_call' + destructive=true 는 영구 blocked", () => {
    expect(
      decideAgentAutomation({
        area: "agent_call",
        action: "codex_diagnose",
        destructive: true,
      }),
    ).toMatchObject({
      mode: "blocked",
      risk: "critical",
    });
  });
});

describe("getAgentPolicySummary", () => {
  it("자동·PR·검토·차단 정책을 모두 노출한다", () => {
    const summary = getAgentPolicySummary();

    expect(summary.auto.length).toBeGreaterThan(0);
    expect(summary.pr.length).toBeGreaterThan(0);
    expect(summary.review.length).toBeGreaterThan(0);
    expect(summary.blocked.length).toBeGreaterThan(0);
    expect(summary.blocked.join(" ")).toContain("품질 검수 실패");
  });
});
