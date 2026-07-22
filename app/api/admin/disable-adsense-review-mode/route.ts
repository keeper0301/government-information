// ============================================================
// /api/admin/disable-adsense-review-mode — AdSense Phase B 자동 트리거
// ============================================================
// 2026-05-31. AdSense 자동 트리거 사이클 마무리. Phase A(599c569)에서 백필
// ≥80% 도달 시 텔레그램 안내 후, 사장님이 텔레그램 link 1-tap 으로 이
// endpoint 호출하면 Vercel API 로 ENV 변경 + production redeploy 자동.
//
// 2026-07-22 — 재거절 대응: 과거 "approved-after-review" 값은 다시 review mode 로
// 취급한다. 실제 Google 승인 후에만 ADSENSE_LIVE_ADS_TOKEN 으로 전환한다.
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
import { ADSENSE_LIVE_ADS_TOKEN } from "@/lib/adsense-review-mode";

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
    이 버튼을 누르면 Vercel ENV 가 ${ADSENSE_LIVE_ADS_TOKEN} 로 변경 + production redeploy 됩니다.
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

// POST — 실제 실행. CSRF(Origin) + admin 인증 + 백필 ≥80% 재확인 + Vercel API 호출.
export async function POST(request: Request): Promise<NextResponse> {
  // 0. CSRF Origin 검증 — same-origin 요청만 허용 (악성 사이트 form 자동 submit 차단).
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "invalid origin" }, { status: 400 });
    }
    if (originHost !== host) {
      return NextResponse.json(
        { error: "CSRF: cross-origin POST 차단" },
        { status: 403 },
      );
    }
  }

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
  let deploymentId: string | null = null;
  try {
    await updateProjectEnvByKey(
      "NEXT_PUBLIC_ADSENSE_REVIEW_MODE",
      ADSENSE_LIVE_ADS_TOKEN,
    );
    envUpdated = true;
  } catch (e) {
    errors.push(`env update: ${(e as Error).message.slice(0, 200)}`);
  }
  if (envUpdated) {
    try {
      const r = await triggerProductionRedeploy();
      deploymentId = r.id;
      redeployed = true;
    } catch (e) {
      errors.push(`redeploy: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  // 4. audit log (실패해도 state 응답에 영향 X — 리뷰어 Major: audit 실패 ≠ state 실패 분리).
  // deployment_id 저장 → webhook 이 build 결과 받으면 매칭 가능 (Critical #2).
  try {
    await logAdminAction({
      actorId: user?.id ?? null,
      action: "adsense_review_mode_disabled",
      details: {
        commentary_backfill_ratio: ratio.commentaryBackfillRatio,
        env_updated: envUpdated,
        redeployed,
        deployment_id: deploymentId,
        errors,
      },
    });
  } catch (e) {
    // audit 실패는 state 변경 후 silent — console 로만 진단.
    console.error(
      "[disable-adsense-review-mode] audit log 실패:",
      (e as Error).message,
    );
  }

  // 5. 성공 시 사장님 가독성 HTML page 로 redirect (raw JSON 노출 ↓ — 리뷰어 Minor).
  // 실패 시 raw JSON 으로 errors 노출 (디버깅 우선).
  if (errors.length === 0) {
    const successHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>AdSense Review Mode OFF 완료</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    h1 { color: #047857; }
    .info { background: #ecfdf5; border: 1px solid #6ee7b7; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .small { color: #64748b; font-size: 12px; margin-top: 16px; }
    a.btn { display: inline-block; background: #1e40af; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; }
  </style>
</head>
<body>
  <h1>✅ AdSense Review Mode OFF 완료</h1>
  <div class="info">
    <strong>Vercel ENV ${ADSENSE_LIVE_ADS_TOKEN} 변경 + production redeploy 모두 성공</strong><br />
    백필 시점: ${(ratio.commentaryBackfillRatio * 100).toFixed(1)}%<br />
    수 분 안에 새 build 가 완료되면 사이트 광고 게재가 시작됩니다.
  </div>
  <p>다음 단계 자동 진행:</p>
  <ul>
    <li>build 완료 (~3~5분)</li>
    <li>sitemap selective 가 ai_commentary 채워진 news 진입 시작</li>
    <li>Google 색인 점진 ramp-up</li>
  </ul>
  <p><a class="btn" href="/admin/autonomous">자율 운영 hub 로 이동</a></p>
  <p class="small">audit log: adsense_review_mode_disabled</p>
</body>
</html>`;
    return new NextResponse(successHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 실패 시 — raw JSON (사장님이 errors 직접 확인 후 재시도 또는 수동 처리).
  return NextResponse.json({
    ok: false,
    commentary_backfill_ratio: ratio.commentaryBackfillRatio,
    env_updated: envUpdated,
    redeployed,
    errors,
  });
}
