// ============================================================
// Agent endpoint 공통 인증 + safety gate (Phase 6 — Codex 자율 운영)
// ============================================================
// /api/agent/* 모든 endpoint 가 공유.
//
// 안전망 4종 (spec 4-2~4-4):
//   1. AGENT_SECRET 검증 (CRON_SECRET 별도)
//   2. AGENT_DISABLED kill switch — env 1줄 변경으로 즉시 차단
//   3. rate limit — 분당 10건 (admin_actions audit 기반 simple counter)
//   4. timing-safe 비교 (HMAC 표준)
//
// rate limit 설계 — Vercel 서버리스 in-memory 무용 → DB count 기반.
// admin_actions.{agent_diagnose_run | agent_execute_run} 최근 60s count 로 판단.
// 정상 운영 (sidecar 5~30분 cycle) 시 분당 1~5 호출 → 10 cap 안전 margin.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "node:crypto";

const RATE_LIMIT_PER_MIN = 10;
const AGENT_ACTIONS = ["agent_diagnose_run", "agent_execute_run"] as const;

export type AgentAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Agent endpoint 공통 가드.
 * AGENT_DISABLED → 503
 * AGENT_SECRET 누락·불일치 → 401
 * rate limit 초과 → 429
 * 통과 → { ok: true }
 */
export async function checkAgentAuth(request: Request): Promise<AgentAuthResult> {
  // 1. Kill switch
  if (process.env.AGENT_DISABLED === "true") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "agent disabled (kill switch)" },
        { status: 503 },
      ),
    };
  }

  // 2. Secret 검증
  const secret = process.env.AGENT_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AGENT_SECRET not configured" },
        { status: 500 },
      ),
    };
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!safeCompare(header, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  // 3. Rate limit — admin_actions 최근 60s count
  const overLimit = await checkRateLimit();
  if (overLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limit", limit_per_min: RATE_LIMIT_PER_MIN },
        { status: 429 },
      ),
    };
  }

  return { ok: true };
}

function safeCompare(a: string, b: string): boolean {
  // 길이 다르면 즉시 false (timingSafeEqual 은 길이 같아야 안전)
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * 최근 60s 안 agent_diagnose_run + agent_execute_run 합산 count.
 * RATE_LIMIT_PER_MIN 이상이면 true (over limit).
 *
 * fetch 실패 시 false (보수적 통과) — DB 사고로 정상 sidecar 차단 회피.
 */
async function checkRateLimit(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .in("action", AGENT_ACTIONS as unknown as string[])
      .gte("created_at", since);
    return (count ?? 0) >= RATE_LIMIT_PER_MIN;
  } catch (e) {
    console.warn(
      "[agent-auth] rate limit check 실패 (fallback 통과):",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
