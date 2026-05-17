// ============================================================
// /api/agent/execute — sidecar Codex 가 액션 실행 요청 (Phase 6 W0~)
// ============================================================
// spec: docs/superpowers/specs/2026-05-18-codex-autonomous-integration-design.md
//
// 핵심 설계 (불변):
//   1. agent-policy.ts decideAgentAutomation 절대 우회 X
//   2. W0 모드 (default): mutate 0 — 모든 액션 audit + 알림만, 실제 실행 X
//      → mode='auto_execute' 결정 나도 admin_actions 큐에만 적재
//      → 사장님이 1주 검증 후 AGENT_W1_ENABLED=true 로 ramp-up
//   3. W1+ : 사전 등록 ACTION_DISPATCHERS 만 실제 실행 (별도 commit 점진 추가)
//
// 안전망 (재사용 from /api/agent/diagnose):
//   - AGENT_DISABLED kill switch
//   - AGENT_SECRET timing-safe
//   - rate limit 분당 10
//
// 입력: POST AgentOperation (agent-policy.ts 타입)
// 출력:
//   { decision: AgentPolicyDecision, dispatched: boolean, audit_id?: string }
// ============================================================

import { NextResponse } from "next/server";
import { checkAgentAuth } from "@/lib/agent/auth";
import {
  decideAgentAutomation,
  type AgentOperation,
  type AgentPolicyDecision,
} from "@/lib/autonomous-ops/agent-policy";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await checkAgentAuth(request);
  if (!auth.ok) return auth.response;

  const startedAt = Date.now();
  let op: AgentOperation | null = null;
  let decision: AgentPolicyDecision | null = null;

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AgentOperation>;
    if (!body.area || !body.action) {
      return NextResponse.json(
        { error: "area + action required", received: body },
        { status: 400 },
      );
    }
    op = body as AgentOperation;

    decision = decideAgentAutomation(op);

    // W1 ramp-up gate — W0 default 는 auto_execute 결정이 나도 실제 실행 X.
    // 사장님 검증 후 AGENT_W1_ENABLED=true 로 ramp-up.
    const w1Enabled = process.env.AGENT_W1_ENABLED === "true";
    const dispatched = w1Enabled && decision.mode === "auto_execute";

    // 모든 호출 audit — 사장님 가시성 (Codex 가 무엇을 하려고 했는지 추적)
    await logAdminAction({
      actorId: null,
      action: "agent_execute_run",
      details: {
        area: op.area,
        action: op.action,
        decision_mode: decision.mode,
        decision_risk: decision.risk,
        decision_reason: decision.reason,
        dispatched,
        w0_pending: !dispatched && decision.mode === "auto_execute",
        duration_ms: Date.now() - startedAt,
      },
    });

    // blocked → 즉시 403 + 사고 시그널
    if (decision.mode === "blocked") {
      return NextResponse.json(
        { decision, dispatched: false, blocked: true },
        { status: 403 },
      );
    }

    // W0 mode (default) — 모든 액션 admin_actions 큐에 적재만, 사장님이 hub 에서 확인
    // W1+ mode — auto_execute 결정 시 실제 dispatch (별도 commit 점진 구현)
    if (decision.mode === "auto_execute" && !w1Enabled) {
      return NextResponse.json(
        {
          decision,
          dispatched: false,
          w0_pending: true,
          note: "AGENT_W1_ENABLED=false — W0 모드. admin_actions 큐 적재만",
        },
        { status: 202 },
      );
    }

    // auto_execute (W1+) — 현재는 placeholder. ACTION_DISPATCHERS 별도 commit 점진 추가
    if (decision.mode === "auto_execute") {
      return NextResponse.json(
        {
          decision,
          dispatched: false,
          w1_dispatcher_missing: true,
          note: `action '${op.action}' dispatcher 미등록. ACTION_DISPATCHERS 추가 후 가동`,
        },
        { status: 202 },
      );
    }

    // create_pr / admin_review — sidecar 측에서 GH PAT or 알림 처리
    return NextResponse.json(
      { decision, dispatched: false, queued: true },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    await logAdminAction({
      actorId: null,
      action: "agent_execute_run",
      details: {
        area: op?.area ?? null,
        action: op?.action ?? null,
        error: msg.slice(0, 300),
        duration_ms: Date.now() - startedAt,
      },
    }).catch(() => {});
    return NextResponse.json({ error: "execute failed", detail: msg }, { status: 500 });
  }
}
