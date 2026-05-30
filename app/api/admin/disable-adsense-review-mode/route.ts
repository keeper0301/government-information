// ============================================================
// /api/admin/disable-adsense-review-mode — AdSense Phase B 자동 트리거
// ============================================================
// 2026-05-31. AdSense 자동 트리거 사이클 마무리. Phase A(599c569)에서 백필
// ≥80% 도달 시 텔레그램 안내 후, 사장님이 텔레그램 link 1-tap 으로 이
// endpoint 호출하면 Vercel API 로 ENV 변경 + production redeploy 자동.
//
// 안전 가드:
// - GET = confirm UI 만 (부작용 X). 사장님이 button 클릭해야 POST 실행.
// - POST = admin 인증 + 백필 비율 ≥80% 재확인 + Vercel API 호출.
// - audit log: adsense_review_mode_disabled action 으로 기록.
// ============================================================

import { NextResponse } from "next/server";
import {
  updateProjectEnvByKey,
  triggerProductionRedeploy,
} from "@/lib/vercel/api";
import { getNewsRatio } from "@/lib/analytics/local-press-stats";
import { logAdminAction } from "@/lib/admin-actions";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET — confirm page (간단 HTML). 사장님 1-tap 흐름: 텔레그램 link 클릭 → 이 page.
export async function GET(): Promise<NextResponse> {
  // 현재 백필 비율 확인 (사장님 시각 정보)
  let backfillPct = "?";
  try {
    const r = await getNewsRatio();
    backfillPct = (r.commentaryBackfillRatio * 100).toFixed(1);
  } catch {
    // graceful
  }
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>AdSense Review Mode OFF 확정</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    h1 { color: #b91c1c; }
    .info { background: #f0f9ff; border: 1px solid #93c5fd; padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 14px; }
    button { background: #b91c1c; color: white; padding: 14px 24px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
    button:hover { background: #991b1b; }
    .small { color: #64748b; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>⚠️ AdSense Review Mode OFF 확정</h1>
  <div class="info">
    <strong>현재 AI 자체 해설 백필: ${backfillPct}%</strong><br />
    이 버튼을 누르면 Vercel ENV 가 자동 off + production redeploy 됩니다.
    사이트 광고가 즉시 가동 시작되고 sitemap selective 가 ai_commentary 채워진 news 진입을 시작합니다.
  </div>
  <form method="POST">
    <button type="submit">🔴 OFF 확정 + Vercel 자동 redeploy</button>
  </form>
  <p class="small">취소: 이 페이지 닫기 (POST 안 누르면 영향 0).</p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// POST — 실제 실행. admin 인증 + 백필 ≥80% 재확인 + Vercel API 호출.
export async function POST(): Promise<NextResponse> {
  // 1. admin 인증
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) {
    return NextResponse.json({ error: "admin only" }, { status: 401 });
  }

  // 2. 백필 비율 ≥80% 재확인 (사장님 실수 차단).
  const ratio = await getNewsRatio();
  if (ratio.commentaryBackfillRatio < 0.8) {
    return NextResponse.json(
      {
        error: "백필 비율 미달",
        commentary_backfill_ratio: ratio.commentaryBackfillRatio,
        message: `백필 ${(ratio.commentaryBackfillRatio * 100).toFixed(1)}% < 80%. review mode off 차단 (안전).`,
      },
      { status: 400 },
    );
  }

  // 3. Vercel API: ENV update + redeploy.
  const errors: string[] = [];
  let envUpdated = false;
  let redeployed = false;
  try {
    await updateProjectEnvByKey("NEXT_PUBLIC_ADSENSE_REVIEW_MODE", "off");
    envUpdated = true;
  } catch (e) {
    errors.push(`env update: ${(e as Error).message.slice(0, 200)}`);
  }
  if (envUpdated) {
    try {
      await triggerProductionRedeploy();
      redeployed = true;
    } catch (e) {
      errors.push(`redeploy: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  // 4. audit log
  await logAdminAction({
    actorId: user?.id ?? null,
    action: "adsense_review_mode_disabled",
    details: {
      commentary_backfill_ratio: ratio.commentaryBackfillRatio,
      env_updated: envUpdated,
      redeployed,
      errors,
    },
  });

  return NextResponse.json({
    ok: errors.length === 0,
    commentary_backfill_ratio: ratio.commentaryBackfillRatio,
    env_updated: envUpdated,
    redeployed,
    errors,
  });
}
