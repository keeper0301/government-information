// ============================================================
// /api/webhooks/vercel-deployment — Vercel deployment 결과 webhook 수신
// ============================================================
// 2026-05-31 Critical #2 — AdSense Phase B(disable-adsense-review-mode) 의
// post-redeploy state 추적. Vercel project settings → Webhooks 에서 등록 후
// 매 deployment.ready/error 발생 시 호출됨.
//
// 인증: HMAC SHA1 signature 검증 (x-vercel-signature 헤더). VERCEL_WEBHOOK_SECRET
// env 미설정 시 자동 graceful skip (사장님 webhook 미등록 상태에서 endpoint 만
// 존재해도 무해).
//
// 매칭: payload.deployment.id 가 최근 1h 안 adsense_review_mode_disabled audit
// details.deployment_id 와 일치 시 → 텔레그램 follow-up 발화.
//   - state=READY → ✅ "AdSense 광고 가동 시작"
//   - state=ERROR/CANCELED → ⚠️ "redeploy 실패, 수동 확인 필요"
// ============================================================

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdsenseDeploymentResult } from "@/lib/adsense/deployment-message";
import { isJsonBodyTooLargeError, readTextWithLimit } from "@/lib/http/json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

type DeploymentWebhookPayload = {
  type?: string; // "deployment.succeeded" · "deployment.error" · "deployment.canceled" 등
  payload?: {
    deployment?: { id?: string; url?: string };
    project?: { id?: string };
  };
};

// HMAC SHA1 검증 — VERCEL_WEBHOOK_SECRET 미설정 시 verify skip(graceful).
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) return true; // graceful skip (사장님 미등록 단계)
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex");
  // length 다르면 즉시 false (timingSafeEqual length 같은 buffer 만 허용)
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature, "utf8"),
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await readTextWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? "body too large" : "invalid body" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }
  const signature = request.headers.get("x-vercel-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: DeploymentWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const deploymentId = payload.payload?.deployment?.id;
  const eventType = payload.type ?? "";
  // 관심 이벤트: deployment.succeeded / deployment.error / deployment.canceled
  const isReady = eventType.endsWith(".succeeded") || eventType.endsWith(".ready");
  const isError =
    eventType.endsWith(".error") || eventType.endsWith(".canceled");
  if (!deploymentId || (!isReady && !isError)) {
    // 관심 없음 — 200 OK 응답으로 Vercel 재시도 막음.
    return NextResponse.json({ ok: true, skipped: "uninterested event" });
  }

  // 최근 1h 안 adsense_review_mode_disabled audit + deployment_id 일치 매칭.
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: matches } = await admin
    .from("admin_actions")
    .select("id, details, created_at")
    .eq("action", "adsense_review_mode_disabled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);

  const match = (matches ?? []).find(
    (r) => (r.details as { deployment_id?: string })?.deployment_id === deploymentId,
  );
  if (!match) {
    // adsense Phase B 무관한 deployment — 평시 push 등. 무시.
    return NextResponse.json({ ok: true, skipped: "not adsense phase b" });
  }

  // 매칭 — helper 가 텔레그램 + dedup audit 둘 다 처리 (메시지 통일 + 비대칭 해소).
  const url = payload.payload?.deployment?.url;
  const state = isReady ? "READY" : eventType.endsWith(".canceled") ? "CANCELED" : "ERROR";
  await notifyAdsenseDeploymentResult({ deploymentId, state, url });

  return NextResponse.json({
    ok: true,
    matched: true,
    deployment_id: deploymentId,
    event: eventType,
  });
}
