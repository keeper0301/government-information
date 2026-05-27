// ============================================================
// /api/cron/self-learning-digest — 자가 진화 학습 결과 텔레그램 요약 (Spec 1+2+3-B)
// ============================================================
// 매주 월 03:30 KST (UTC 일 18:30). 학습 3 cron 가동 직후 결과 요약:
//   02:00 press_confidence_tune_run
//   02:30 popularity_weights_tune_run
//   03:00 push_time_learn_run
//   03:30 ↓ 이 cron — 위 3건 결과 admin_actions fetch + 텔레그램 발송
//
// 사장님 매주 한 번 hub 안 봐도 학습 진행 가시화 + 변경 발생 시 즉시 인지.
// 텔레그램 발송 실패 (SMS 룰 동일) 시 audit 로 흔적 + 후속 health-alert.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RecentAction = { details: Record<string, unknown> | null; created_at: string } | null;

async function fetchRecentAction(action: string, hoursAgo: number): Promise<RecentAction> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const { data } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", action)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as RecentAction;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function buildPressTierLine(action: RecentAction): string[] {
  if (!action) return ["  ⚠️ 결과 없음 (cron 미가동 또는 fetch 실패)"];
  const d = action.details ?? {};
  const outcome = String((d as Record<string, unknown>).outcome ?? "unknown");
  const current = String((d as Record<string, unknown>).current ?? "-");
  const next = String((d as Record<string, unknown>).next ?? (d as Record<string, unknown>).current ?? "-");
  const reason = truncate(String((d as Record<string, unknown>).reason ?? ""), 200);
  const icon = outcome === "changed" ? "✅" : "⏸";
  const arrow = current === next ? current : `${current} → ${next}`;
  const lines = [`  ${icon} ${outcome} (${arrow})`];
  if (reason) lines.push(`  ${reason}`);
  return lines;
}

export function buildPopularityLine(action: RecentAction): string[] {
  if (!action) return ["  ⚠️ 결과 없음"];
  const d = (action.details ?? {}) as Record<string, unknown>;
  const outcome = String(d.outcome ?? "unknown");
  const current = d.current as
    | { viewWeight?: number; applyWeight?: number; maxBoost?: number }
    | undefined;
  const reason = truncate(String(d.reason ?? ""), 200);
  const icon = outcome === "changed" ? "✅" : "⏸";
  const w = current
    ? `view=${current.viewWeight} apply=${current.applyWeight} max=${current.maxBoost}`
    : "-";
  const lines = [`  ${icon} ${outcome} (${w})`];
  if (reason) lines.push(`  ${reason}`);
  return lines;
}

export function buildPushLearnLine(action: RecentAction): string[] {
  if (!action) return ["  ⚠️ 결과 없음 (subscriber 0?)"];
  const d = (action.details ?? {}) as Record<string, unknown>;
  const total = Number(d.total ?? 0);
  const changed = Number(d.changed ?? 0);
  const skipped = Number(d.skipped ?? 0);
  if (total === 0) return ["  ⏸ no_active_users (subscriber 0)"];
  return [`  ✅ user ${total}명 학습 — 변경 ${changed} · skip ${skipped}`];
}

export async function buildDigest(): Promise<string> {
  // 직전 2시간 안 결과 (학습 cron 들이 02:00~03:00 가동, digest 03:30 호출)
  const [press, popularity, pushLearn] = await Promise.all([
    fetchRecentAction("press_confidence_tune_run", 2),
    fetchRecentAction("popularity_weights_tune_run", 2),
    fetchRecentAction("push_time_learn_run", 2),
  ]);

  const lines: string[] = ["🤖 자가 진화 학습 결과 — 매주 월 새벽", ""];

  lines.push("📊 Spec 1 · press tier_floor");
  lines.push(...buildPressTierLine(press));
  lines.push("");

  lines.push("📊 Spec 2 · popularity weights");
  lines.push(...buildPopularityLine(popularity));
  lines.push("");

  lines.push("📊 Spec 3-B · push 시점 학습");
  lines.push(...buildPushLearnLine(pushLearn));
  lines.push("");

  lines.push("📈 상세: keepioo.com/admin/autonomous");

  return lines.join("\n");
}

async function run() {
  try {
    const digest = await buildDigest();
    const result = await sendOpsAlertTelegram({
      subject: "자가 진화 학습 다이제스트",
      message: digest,
    });
    if (result.ok) {
      return { success: true, sent: result.sent, failed: result.failed };
    }
    return {
      success: false,
      reason: result.reason,
      error: "error" in result ? result.error : undefined,
    };
  } catch (err) {
    return { success: false, reason: "exception", error: (err as Error).message };
  }
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await run();
  await logAdminAction({
    actorId: null,
    action: "self_learning_digest_run",
    details: result,
  });
  await auditCronRun("self_learning_digest_run", {
    success: result.success,
    error: result.success ? undefined : "error" in result ? result.error : result.reason,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
