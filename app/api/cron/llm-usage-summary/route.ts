// ============================================================
// 가-A3 — 24h LLM 호출 audit 합산 + 텔레그램 보고 (비용 추정).
// ============================================================
// 매일 KST 09:50 (UTC 00:50) — 다른 cron 들 직후.
// admin_actions 에서 LLM 관련 action 별 24h count 합산. 비용 추정 (Haiku 기준).
// 추정 비용 ≥ env LLM_USAGE_ALERT_USD (default 5) 면 텔레그램 alert.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// LLM 호출 관련 admin_action 의 추정 호출 수 / audit 1건당.
// 일부 cron 은 배치 통계만 audit (1 audit = N 호출) — multiplier 로 보정.
const COST_PER_CALL_USD: Record<string, number> = {
  press_l2_classify: 0.003, // 1건 = 1 호출
  news_classify_run: 0.003 * 30, // 1 audit = ~30 호출 (cron 통계)
  category_backfill_run: 0.003 * 50, // 1 audit = ~50 호출
  blog_quality_flag: 0.005, // 1 audit = 1 호출 (flag 된 것만 — 전체 호출 ≥ flag)
  // press_l2_auto_revoke / restore 등 LLM 무관은 X
};

async function notifyTelegram(text: string): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return;
  await fetch("https://www.keepioo.com/api/notify-telegram", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  }).catch(() => undefined);
}

async function run() {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const alertUsd = Number(process.env.LLM_USAGE_ALERT_USD ?? "5");

  const breakdown: Record<string, { count: number; estUsd: number }> = {};
  let totalCount = 0;
  let totalUsd = 0;

  for (const action of Object.keys(COST_PER_CALL_USD)) {
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", action)
      .gte("created_at", since24h);
    const c = count ?? 0;
    const usd = c * COST_PER_CALL_USD[action];
    breakdown[action] = { count: c, estUsd: Math.round(usd * 100) / 100 };
    totalCount += c;
    totalUsd += usd;
  }
  totalUsd = Math.round(totalUsd * 100) / 100;

  // 임계 초과 시만 텔레그램 alert (noise 방지). 그 외엔 stdout/audit 만.
  if (totalUsd >= alertUsd) {
    const lines = [
      `[keepioo] ⚠ LLM 24h 추정 비용 $${totalUsd} (임계 $${alertUsd})`,
      "",
      "내역:",
      ...Object.entries(breakdown)
        .filter(([, v]) => v.count > 0)
        .map(([k, v]) => `· ${k}: ${v.count}건 / 약 $${v.estUsd}`),
      "",
      "월 환산 약 $" + Math.round(totalUsd * 30) + ". 추세 이상 시 cron 빈도·cap 검토",
    ].join("\n");
    await notifyTelegram(lines);
  }

  try {
    await logAdminAction({
      actorId: null,
      action: "llm_usage_summary",
      details: { totalCount, totalUsd, breakdown, alertUsd, alerted: totalUsd >= alertUsd },
    });
  } catch (e) {
    console.warn("[llm-usage-summary] audit 실패:", e);
  }

  return NextResponse.json({
    ok: true,
    totalCount,
    totalUsd,
    breakdown,
    alerted: totalUsd >= alertUsd,
  });
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
