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

  it("schema·secret·payment 는 관리자 검토로 보낸다", () => {
    expect(
      decideAgentAutomation({
        area: "data",
        action: "apply_migration",
        touchesSchema: true,
      }).mode,
    ).toBe("admin_review");
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
