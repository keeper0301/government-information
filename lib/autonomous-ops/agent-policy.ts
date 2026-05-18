// ============================================================
// 자율 운영 에이전트 권한 정책
// ============================================================
// "사이트를 100% 자동 관리" 요구를 실제 운영 가능한 형태로 분리한다.
// 저위험은 자동 실행, 중위험은 PR/검수, 고위험은 승인 또는 차단.
// 이 모듈은 Claude/Codex/cron/auto-fix 가 같은 기준을 쓰기 위한
// single source of truth 이다.
// ============================================================

export type AgentOperationArea =
  | "site_ops"
  | "content"
  | "external_publish"
  | "bug_fix"
  | "security"
  | "data"
  | "secrets"
  | "payments"
  | "agent_call";  // 2026-05-18 Phase 6 — Codex 호출 자체 분류 (diagnose / execute meta-action)

export type AgentAutomationMode =
  | "auto_execute"
  | "create_pr"
  | "admin_review"
  | "blocked";

export type AgentRiskLevel = "low" | "medium" | "high" | "critical";

export type AgentOperation = {
  area: AgentOperationArea;
  action: string;
  destructive?: boolean;
  touchesAuth?: boolean;
  touchesSecrets?: boolean;
  touchesPayments?: boolean;
  touchesSchema?: boolean;
  externalPublish?: boolean;
  qualityApproved?: boolean | null;
};

export type AgentPolicyDecision = {
  mode: AgentAutomationMode;
  risk: AgentRiskLevel;
  reason: string;
};

export type AgentPolicySummary = {
  auto: string[];
  pr: string[];
  review: string[];
  blocked: string[];
};

const AUTO_ACTIONS = new Set([
  "health_check",
  "cron_audit",
  "quality_score",
  "indexnow_submit",
  "retry_safe_cron",
  "content_generate_with_quality_gate",
  "external_signal_learning",
  // 2026-05-18 Phase 6 W0 — Codex diagnose 는 read-only DB query 라 auto_execute 안전
  "codex_diagnose",
]);

const PR_ACTIONS = new Set([
  "scraper_regex_fix",
  "ui_dashboard_change",
  "prompt_tuning",
  "notification_copy_change",
  "non_destructive_backfill",
  // 2026-05-18 Phase 6 W1 (선반영) — sidecar Codex 가 PR 생성 활성화 시 가동
  "codex_scraper_fix",
  "codex_ui_copy_fix",
  "codex_prompt_tuning",
  "codex_cron_fix",
  "codex_notification_fix",
  "codex_blog_publish_fix",
]);

export function decideAgentAutomation(
  op: AgentOperation,
): AgentPolicyDecision {
  if (op.destructive) {
    return {
      mode: "blocked",
      risk: "critical",
      reason: "삭제·reset·force push 같은 파괴 작업은 자동 실행하지 않습니다.",
    };
  }

  if (op.touchesSecrets || op.area === "secrets") {
    return {
      mode: "admin_review",
      risk: "critical",
      reason: "시크릿·토큰·환경변수 변경은 관리자 검토와 감사 로그가 필요합니다.",
    };
  }

  if (op.touchesPayments || op.area === "payments") {
    return {
      mode: "admin_review",
      risk: "critical",
      reason: "결제·환불·청구 로직은 자동 적용하지 않고 관리자 검토를 거칩니다.",
    };
  }

  if (op.touchesAuth || op.area === "security") {
    return {
      mode: "create_pr",
      risk: "high",
      reason: "인증·권한·보안 변경은 자동 PR과 테스트를 거친 뒤 병합합니다.",
    };
  }

  if (op.touchesSchema) {
    return {
      mode: "create_pr",
      risk: "high",
      reason: "운영 DB schema 변경은 허용하되 migration PR과 테스트를 거친 뒤 반영합니다.",
    };
  }

  if (op.externalPublish && op.qualityApproved !== true) {
    return {
      mode: "blocked",
      risk: "high",
      reason: "외부 채널 발행은 품질 검수 통과 글만 자동 진행합니다.",
    };
  }

  if (AUTO_ACTIONS.has(op.action)) {
    return {
      mode: "auto_execute",
      risk: "low",
      reason: "읽기·감사·품질 점수화·안전 재시도는 자동 실행 가능합니다.",
    };
  }

  if (PR_ACTIONS.has(op.action)) {
    return {
      mode: "create_pr",
      risk: "medium",
      reason: "코드·카피·프롬프트 변경은 PR로 남기고 테스트 후 반영합니다.",
    };
  }

  return {
    mode: "admin_review",
    risk: "medium",
    reason: "분류되지 않은 작업은 관리자 검토로 보수적으로 처리합니다.",
  };
}

export function getAgentPolicySummary(): AgentPolicySummary {
  return {
    auto: [
      "헬스체크·cron audit·운영 신호 수집",
      "블로그 품질 점수화와 품질 통과 글의 외부 발행 재개",
      "IndexNow 제출과 안전한 cron 재시도",
      "외부 채널 성공/실패 신호를 다음 글 생성에 학습",
    ],
    pr: [
      "스크래퍼 regex/selector 수정",
      "프롬프트·SEO 문구·알림 copy 변경",
      "어드민 dashboard UI 개선",
      "운영 DB schema migration PR 생성",
      "인증·보안 관련 코드 변경",
    ],
    review: [
      "시크릿·토큰·환경변수 교체",
      "결제·환불·구독 상태 변경",
      "분류되지 않은 신규 자동화 작업",
    ],
    blocked: [
      "품질 검수 실패 글의 외부 자동 발행",
      "삭제·reset·force push 같은 파괴 작업",
      "감사 로그 없는 권한 우회",
    ],
  };
}
