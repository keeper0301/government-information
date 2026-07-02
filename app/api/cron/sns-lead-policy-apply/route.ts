// ============================================================
// /api/cron/sns-lead-policy-apply — approved SNS lead policy change
// ============================================================
// CRON_SECRET 보호 수동 운영 endpoint. 자동 실험 확대가 아니라, 관철/관리자
// 승인 후 GitHub Actions에서 정확히 한 lead 정책 변경을 감사 로그로 남긴다.
// 기본값은 sample-blocked 복구용 lead_3 active + challenger 20% 유지.
// ============================================================

import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import {
  CHALLENGER_LEAD_VARIANTS,
  loadSnsLeadPolicySnapshot,
  normalizeLeadPolicyInput,
} from "@/lib/sns-control-tower/lead-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_REASON =
  "관리자 승인: challenger 표본 차단 해소 — lead_3 1개만 20% 제한 노출로 30세션까지 관찰";

async function applyPolicy(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const policy = normalizeLeadPolicyInput({
    content: url.searchParams.get("content") || "lead_3",
    status: url.searchParams.get("status") || "active",
    reason: url.searchParams.get("reason") || DEFAULT_REASON,
  });

  if (policy.status === "active" && CHALLENGER_LEAD_VARIANTS.includes(policy.content)) {
    const current = await loadSnsLeadPolicySnapshot();
    const activeOtherChallenger = current.policies.find(
      (row) =>
        CHALLENGER_LEAD_VARIANTS.includes(row.content) &&
        row.content !== policy.content &&
        row.status === "active",
    );
    if (activeOtherChallenger) {
      return NextResponse.json(
        {
          ok: false,
          error: "another_challenger_already_active",
          activeOtherChallenger: activeOtherChallenger.content,
        },
        { status: 409 },
      );
    }
  }

  await logAdminAction({
    actorId: null,
    action: "sns_lead_policy_update",
    details: policy,
  });

  const after = await loadSnsLeadPolicySnapshot();
  return NextResponse.json({
    ok: true,
    applied: policy,
    challengerTrafficPct: after.challengerTrafficPct,
    disabledLeadVariants: after.disabledLeadVariants,
    activeLeadCount: after.policies.filter((row) => row.status === "active").length,
  });
}

export async function GET(request: Request) {
  return applyPolicy(request);
}

export async function POST(request: Request) {
  return applyPolicy(request);
}
