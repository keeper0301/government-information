// app/api/auto-confirm-stats/route.ts
// B안 자동 confirm 24h+7d 통계 GET endpoint.
// 사용처: claude.ai routine (24h 후 1회) — Vercel MCP 로 CRON_SECRET 조회 후 fetch.
// 응답 구조는 routine prompt 가 그대로 메일 본문 빌드에 사용.
//
// 인증: CRON_SECRET Bearer (cron route 와 동일 패턴).
// 보안: 통계 카운트만 노출 (PII 0). 인증 실패 시 401.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function safe(p: PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const r = await p;
    return r.count ?? 0;
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 24h 자동 등록 (welfare + loan, tier 별)
  const [w24High, w24Mid, l24High, l24Mid, w7High, w7Mid, l7High, l7Mid] = await Promise.all([
    safe(admin.from("welfare_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "high").gte("auto_confirmed_at", since24h)),
    safe(admin.from("welfare_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "mid").gte("auto_confirmed_at", since24h)),
    safe(admin.from("loan_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "high").gte("auto_confirmed_at", since24h)),
    safe(admin.from("loan_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "mid").gte("auto_confirmed_at", since24h)),
    safe(admin.from("welfare_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "high").gte("auto_confirmed_at", since7d)),
    safe(admin.from("welfare_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "mid").gte("auto_confirmed_at", since7d)),
    safe(admin.from("loan_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "high").gte("auto_confirmed_at", since7d)),
    safe(admin.from("loan_programs").select("id", { count: "exact", head: true })
      .eq("auto_confirm_tier", "mid").gte("auto_confirmed_at", since7d)),
  ]);

  const highCount24h = w24High + l24High;
  const midCount24h = w24Mid + l24Mid;
  const autoConfirm24h = highCount24h + midCount24h;
  const highCount7d = w7High + l7High;
  const midCount7d = w7Mid + l7Mid;
  const autoConfirm7d = highCount7d + midCount7d;

  // 24h 회수 + 7d 회수
  const [revoke24h, revoke7d] = await Promise.all([
    safe(admin.from("admin_actions").select("id", { count: "exact", head: true })
      .eq("action", "press_l2_auto_revoke").gte("created_at", since24h)),
    safe(admin.from("admin_actions").select("id", { count: "exact", head: true })
      .eq("action", "press_l2_auto_revoke").gte("created_at", since7d)),
  ]);

  // mid 회수율 (7d) — admin_actions.details.auto_confirm_tier='mid' 만 합산
  let midRevoke7d = 0;
  try {
    const { data } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "press_l2_auto_revoke")
      .gte("created_at", since7d);
    midRevoke7d = (data ?? []).filter(
      (r) => (r as { details?: { auto_confirm_tier?: string } | null }).details?.auto_confirm_tier === "mid",
    ).length;
  } catch {
    midRevoke7d = 0;
  }
  const midRevokeRate7d = midCount7d > 0 ? Math.round((midRevoke7d / midCount7d) * 100) : 0;
  const revokeRate7d = autoConfirm7d > 0 ? Math.round((revoke7d / autoConfirm7d) * 100) : 0;

  // 현재 적체 큐
  const [lowQueue, pressPending, newsBacklog] = await Promise.all([
    safe(admin.from("press_ingest_candidates").select("id", { count: "exact", head: true })
      .eq("status", "pending").eq("confidence_tier", "low")),
    safe(admin.from("press_ingest_candidates").select("id", { count: "exact", head: true })
      .eq("status", "pending")),
    safe(admin.from("news_posts").select("id", { count: "exact", head: true })
      .is("classified_at", null).eq("is_hidden", false)),
  ]);

  // low 의 사장님 검수 결과 7d (튜닝 핵심) — confirm/reject 비율로 LLM 보수성 판단
  const [lowConfirmed7d, lowRejected7d] = await Promise.all([
    safe(admin.from("press_ingest_candidates").select("id", { count: "exact", head: true })
      .eq("confidence_tier", "low").eq("status", "confirmed").gte("created_at", since7d)),
    safe(admin.from("press_ingest_candidates").select("id", { count: "exact", head: true })
      .eq("confidence_tier", "low").eq("status", "rejected").gte("created_at", since7d)),
  ]);
  const lowDecided7d = lowConfirmed7d + lowRejected7d;
  const lowConfirmRate7d = lowDecided7d > 0 ? Math.round((lowConfirmed7d / lowDecided7d) * 100) : 0;
  // > 50%: LLM 너무 보수적 (low 도 자동 confirm 가능). < 30%: LLM 정확 (현 상태 유지).
  const lowConfirmRateHint =
    lowDecided7d < 5 ? "데이터 부족" :
    lowConfirmRate7d > 50 ? "LLM 보수적 — AUTO_CONFIRM_TIER_FLOOR=low 검토" :
    lowConfirmRate7d < 30 ? "LLM 정확 — 현 상태 유지" : "관찰 중";

  const midRevokeRateWarning = midRevokeRate7d > 5;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    autoConfirm24h,
    highCount24h,
    midCount24h,
    autoConfirm7d,
    highCount7d,
    midCount7d,
    autoRevoke24h: revoke24h,
    autoRevoke7d: revoke7d,
    revokeRate7d,
    midRevokeRate7d,
    midRevokeRateWarning,
    pressLowTierBacklog: lowQueue,
    pressPending,
    newsBacklog,
    // low tier 의 사장님 검수 결과 (1주차 튜닝 데이터)
    lowConfirmed7d,
    lowRejected7d,
    lowConfirmRate7d,
    lowConfirmRateHint,
  });
}
