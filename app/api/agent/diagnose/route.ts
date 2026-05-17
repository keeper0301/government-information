// ============================================================
// /api/agent/diagnose — sidecar Codex 가 사고 진단 시 호출 (Phase 6 W0)
// ============================================================
// spec: docs/superpowers/specs/2026-05-18-codex-autonomous-integration-design.md
//
// 안전망:
//   - AGENT_SECRET 검증 (CRON_SECRET 별도)
//   - AGENT_DISABLED kill switch
//   - rate limit 분당 10건
//   - 사전 정의 question_id 만 — 자유 SQL X
//   - audit admin_actions.agent_diagnose_run (사장님 가시성)
//
// 입력: POST { question: DiagnoseQuestion }
// 출력: { question, data, collected_at }
// ============================================================

import { NextResponse } from "next/server";
import { checkAgentAuth } from "@/lib/agent/auth";
import {
  runDiagnose,
  listDiagnoseQuestions,
  type DiagnoseQuestion,
} from "@/lib/agent/diagnose";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  // 가능한 question 목록 반환 — sidecar discovery 용. 인증 불필요 (목록만).
  return NextResponse.json({
    questions: listDiagnoseQuestions(),
  });
}

export async function POST(request: Request) {
  const auth = await checkAgentAuth(request);
  if (!auth.ok) return auth.response;

  const startedAt = Date.now();
  let question: DiagnoseQuestion | null = null;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      question?: unknown;
    };
    if (typeof body.question !== "string") {
      return NextResponse.json(
        { error: "question (string) required" },
        { status: 400 },
      );
    }
    const allowed = listDiagnoseQuestions();
    if (!allowed.includes(body.question as DiagnoseQuestion)) {
      return NextResponse.json(
        { error: "unknown question", allowed },
        { status: 400 },
      );
    }
    question = body.question as DiagnoseQuestion;

    const result = await runDiagnose(question);

    // 가시성 audit — Codex 본인 행동도 사장님 / agent_recent_actions 진단에 노출
    await logAdminAction({
      actorId: null,
      action: "agent_diagnose_run",
      details: {
        question,
        duration_ms: Date.now() - startedAt,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    await logAdminAction({
      actorId: null,
      action: "agent_diagnose_run",
      details: {
        question,
        error: msg.slice(0, 300),
        duration_ms: Date.now() - startedAt,
      },
    }).catch(() => {});
    return NextResponse.json({ error: "diagnose failed", detail: msg }, { status: 500 });
  }
}
