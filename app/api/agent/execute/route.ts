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
//   3. W2+ : 사전 등록 ACTION_DISPATCHERS 만 실제 실행
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
import {
  listDiagnoseQuestions,
  runDiagnose,
  type DiagnoseQuestion,
} from "@/lib/agent/diagnose";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type DispatchResult = {
  action: string;
  status: "completed";
  data: unknown;
};

type ActionDispatcher = (op: AgentOperation) => Promise<DispatchResult>;

const ACTION_DISPATCHERS: Record<string, ActionDispatcher> = {
  codex_diagnose: async (op) => {
    const question = readDiagnoseQuestion(op);
    if (question) {
      return {
        action: op.action,
        status: "completed",
        data: await runDiagnose(question),
      };
    }

    const questions = listDiagnoseQuestions();
    const results = await Promise.all(questions.map((q) => runDiagnose(q)));
    return {
      action: op.action,
      status: "completed",
      data: {
        question_count: results.length,
        results,
      },
    };
  },

  health_check: async (op) => ({
    action: op.action,
    status: "completed",
    data: await runDiagnose("health_overview"),
  }),

  cron_audit: async (op) => ({
    action: op.action,
    status: "completed",
    data: await runDiagnose("cron_recent_24h"),
  }),

  quality_score: async (op) => ({
    action: op.action,
    status: "completed",
    data: await runDiagnose("blog_publish_status"),
  }),
};

function readDiagnoseQuestion(op: AgentOperation): DiagnoseQuestion | null {
  const candidate = (op as AgentOperation & { question?: unknown }).question;
  if (typeof candidate !== "string") return null;
  return (listDiagnoseQuestions() as string[]).includes(candidate)
    ? (candidate as DiagnoseQuestion)
    : null;
}

async function auditAgentExecution(input: {
  op: AgentOperation;
  decision: AgentPolicyDecision;
  startedAt: number;
  w1Enabled: boolean;
  w2Enabled: boolean;
  dispatcherReady: boolean;
  dispatched: boolean;
  dispatchResult?: DispatchResult | null;
  blocked?: boolean;
}) {
  await logAdminAction({
    actorId: null,
    action: "agent_execute_run",
    details: {
      area: input.op.area,
      action: input.op.action,
      decision_mode: input.decision.mode,
      decision_risk: input.decision.risk,
      decision_reason: input.decision.reason,
      dispatched: input.dispatched,
      w1_enabled: input.w1Enabled,
      w2_enabled: input.w2Enabled,
      dispatcher_ready: input.dispatcherReady,
      blocked: input.blocked ?? false,
      w0_pending: !input.w2Enabled && input.decision.mode === "auto_execute",
      w2_dispatcher_missing:
        input.w2Enabled && input.decision.mode === "auto_execute" && !input.dispatcherReady,
      dispatch_status: input.dispatchResult?.status ?? null,
      duration_ms: Date.now() - input.startedAt,
    },
  });
}

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

    // W1 = create_pr, W2 = 등록 dispatcher 직접 실행.
    const w1Enabled = process.env.AGENT_W1_ENABLED === "true";
    const w2Enabled = process.env.AGENT_W2_ENABLED === "true";
    const dispatcher = ACTION_DISPATCHERS[op.action];
    const dispatcherReady = Boolean(dispatcher);

    // blocked → 즉시 403 + 사고 시그널
    if (decision.mode === "blocked") {
      await auditAgentExecution({
        op,
        decision,
        startedAt,
        w1Enabled,
        w2Enabled,
        dispatcherReady,
        dispatched: false,
        blocked: true,
      });
      return NextResponse.json(
        { decision, dispatched: false, blocked: true },
        { status: 403 },
      );
    }

    // W0/W1 mode — auto_execute 결정도 audit queue 에만 남김.
    if (decision.mode === "auto_execute" && !w2Enabled) {
      await auditAgentExecution({
        op,
        decision,
        startedAt,
        w1Enabled,
        w2Enabled,
        dispatcherReady,
        dispatched: false,
      });
      return NextResponse.json(
        {
          decision,
          dispatched: false,
          w0_pending: true,
          note: "AGENT_W2_ENABLED=false — W0/W1 모드. admin_actions 큐 적재만",
        },
        { status: 202 },
      );
    }

    // auto_execute (W2+) — 등록 dispatcher 만 직접 실행.
    if (decision.mode === "auto_execute" && !dispatcher) {
      await auditAgentExecution({
        op,
        decision,
        startedAt,
        w1Enabled,
        w2Enabled,
        dispatcherReady,
        dispatched: false,
      });
      return NextResponse.json(
        {
          decision,
          dispatched: false,
          w2_dispatcher_missing: true,
          note: `action '${op.action}' dispatcher 미등록. ACTION_DISPATCHERS 추가 후 가동`,
        },
        { status: 202 },
      );
    }

    if (decision.mode === "auto_execute") {
      const dispatchResult = await dispatcher(op);
      await auditAgentExecution({
        op,
        decision,
        startedAt,
        w1Enabled,
        w2Enabled,
        dispatcherReady,
        dispatched: true,
        dispatchResult,
      });
      return NextResponse.json(
        { decision, dispatched: true, dispatch_result: dispatchResult },
        { status: 200 },
      );
    }

    // create_pr / admin_review — sidecar 측에서 GH PAT or 알림 처리
    await auditAgentExecution({
      op,
      decision,
      startedAt,
      w1Enabled,
      w2Enabled,
      dispatcherReady,
      dispatched: false,
    });
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
