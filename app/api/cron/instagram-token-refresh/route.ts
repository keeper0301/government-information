// ============================================================
// 인스타 Long-Lived Token 60일 만료 방지 — 매월 1일 09:00 KST refresh
// ============================================================
// Graph API: long-lived token 은 60일 만료. 만료 전 refresh 호출 시 또 60일 연장.
// 매월 1일 cron 으로 자동 갱신 → 영구 가동.
//
// 갱신 성공 시 새 token 을 응답 body 로 반환 (사장님이 Vercel env 업데이트).
// 실패 시 health-alert 가 다음 09:00 점검 시 즉시 감지 (cron 마지막 실행 흔적 확인).
//
// 향후 개선: Vercel API 호출해서 env 자동 업데이트 (VERCEL_TOKEN 사용).
//   현재는 admin_actions audit 만 기록 — 사장님이 텔레그램에서 확인 후 수동 업데이트.
//
// vercel.json: { "path": "/api/cron/instagram-token-refresh", "schedule": "0 0 1 * *" }
// ============================================================

import { NextResponse } from "next/server";
import { refreshInstagramToken } from "@/lib/instagram/refresh-token";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // env 미설정 시 graceful skip
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    return NextResponse.json({
      status: "not_configured",
      message: "INSTAGRAM_ACCESS_TOKEN 미설정 — refresh skip",
    });
  }

  const result = await refreshInstagramToken();

  await logAdminAction({
    actorId: null,
    action: "instagram_token_refresh",
    details: {
      ok: result.ok,
      // 보안: 토큰 값 audit 에 저장 안 함 (앞 8자만 흔적용)
      newTokenPreview: result.newToken ? result.newToken.slice(0, 8) + "..." : null,
      expiresIn: result.expiresIn,
      error: result.error,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { status: "error", error: result.error },
      { status: 500 },
    );
  }

  // 새 token 을 보안상 일부만 반환 — 사장님이 Vercel env 업데이트 시 audit 에서 확인
  return NextResponse.json({
    status: "ok",
    expiresIn: result.expiresIn,
    newTokenPreview: result.newToken!.slice(0, 8) + "...",
    instruction:
      "새 token 은 audit log 에서 확인 또는 cron 로그에서 추출. Vercel env INSTAGRAM_ACCESS_TOKEN 업데이트 필요",
  });
}
