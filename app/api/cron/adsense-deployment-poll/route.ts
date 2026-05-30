// ============================================================
// /api/cron/adsense-deployment-poll — Critical #2 polling fallback
// ============================================================
// 2026-05-31. Vercel webhook 등록(/api/webhooks/vercel-deployment) 미완료
// 상태에서도 동일 효과. 매 5분 최근 30분 안 adsense_review_mode_disabled
// audit + deployment_id 의 state 확인 → READY/ERROR 시 텔레그램 follow-up.
//
// dedup: 처리 완료한 deployment_id 는 audit table 에 별도 row
// (adsense_deployment_state_resolved) 로 insert → 다음 cron 회차 skip.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeploymentById } from "@/lib/vercel/api";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type AuditDetails = {
  deployment_id?: string;
  env_updated?: boolean;
  redeployed?: boolean;
};

async function run() {
  if (!process.env.VERCEL_TOKEN) {
    return NextResponse.json({ ok: true, skipped: "VERCEL_TOKEN missing" });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();

  // 최근 30분 안 disable-adsense-review-mode + deployment_id 있는 row.
  const { data: triggers } = await admin
    .from("admin_actions")
    .select("id, details, created_at")
    .eq("action", "adsense_review_mode_disabled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!triggers || triggers.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  // 이미 처리한 deployment_id 추출 (dedup).
  const { data: resolved } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "adsense_deployment_state_resolved")
    .gte("created_at", since);
  const resolvedIds = new Set(
    (resolved ?? [])
      .map((r) => (r.details as AuditDetails)?.deployment_id)
      .filter(Boolean),
  );

  let checked = 0;
  let resolved_count = 0;
  for (const row of triggers) {
    const d = (row.details ?? {}) as AuditDetails;
    const depId = d.deployment_id;
    if (!depId) continue;
    if (resolvedIds.has(depId)) continue;
    checked += 1;

    let state = "UNKNOWN";
    let url: string | undefined;
    try {
      const r = await getDeploymentById(depId);
      state = r.state;
      url = r.url;
    } catch (e) {
      console.warn(
        `[adsense-deployment-poll] ${depId} state 조회 실패:`,
        (e as Error).message,
      );
      continue;
    }

    const isReady = state === "READY";
    const isFinal =
      state === "READY" ||
      state === "ERROR" ||
      state === "CANCELED";
    if (!isFinal) continue; // BUILDING/QUEUED — 다음 회차 재시도

    // 텔레그램 follow-up + resolved audit insert.
    const subject = isReady
      ? "✅ AdSense 광고 가동 시작"
      : "⚠️ AdSense redeploy 실패 (수동 확인 필요)";
    const message = isReady
      ? [
          `AdSense Phase B redeploy 완료 — production build 성공.`,
          ``,
          `사이트 광고 게재 가동 시작. sitemap selective 가 ai_commentary 채워진 news 진입 → Google 색인 점진 ramp-up.`,
          url ? `deployment: https://${url}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `AdSense Phase B redeploy 실패 (state=${state}).`,
          ``,
          `사장님 액션:`,
          `1. Vercel deployments page 에서 실패 사유 확인`,
          `2. ENV NEXT_PUBLIC_ADSENSE_REVIEW_MODE=on 으로 복원 + 재시도`,
          url ? `deployment: https://${url}` : "",
        ]
          .filter(Boolean)
          .join("\n");

    try {
      await sendOpsAlertTelegram({ subject, message });
    } catch {
      // 텔레그램 실패는 silent.
    }

    try {
      await logAdminAction({
        actorId: null,
        action: "adsense_deployment_state_resolved",
        details: { deployment_id: depId, state, url },
      });
      resolved_count += 1;
    } catch {
      // audit 실패해도 텔레그램은 발화 — 다음 회차에 dedup 안 되어 중복 발화 가능 (low risk).
    }
  }

  return NextResponse.json({ ok: true, checked, resolved: resolved_count });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
