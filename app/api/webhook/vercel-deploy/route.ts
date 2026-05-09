// ============================================================
// 가-A2 — Vercel deployment webhook 수신 (실패 시 텔레그램 알림).
// ============================================================
// Vercel 콘솔에서 webhook URL 등록: https://www.keepioo.com/api/webhook/vercel-deploy
// 이벤트: deployment.error / deployment.failed.
// HMAC-SHA1 서명 검증: X-Vercel-Signature 헤더.
// env: VERCEL_WEBHOOK_SECRET

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface VercelWebhookPayload {
  type?: string;
  payload?: {
    deployment?: {
      url?: string;
      name?: string;
      meta?: { githubCommitMessage?: string; githubCommitRef?: string };
    };
    project?: { name?: string };
    target?: string;
  };
  createdAt?: number;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

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

export async function POST(request: NextRequest) {
  // raw body 로 받음 (서명 검증용)
  const rawBody = await request.text();
  const signature = request.headers.get("x-vercel-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: VercelWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as VercelWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 실패 이벤트 만 처리 — 성공은 무시 (noise 방지)
  const isFailureEvent =
    payload.type === "deployment.error" || payload.type === "deployment.failed";
  if (!isFailureEvent) {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }

  const project = payload.payload?.project?.name ?? "unknown";
  const target = payload.payload?.target ?? "unknown";
  const url = payload.payload?.deployment?.url ?? "";
  const commitMsg = payload.payload?.deployment?.meta?.githubCommitMessage ?? "";
  const ref = payload.payload?.deployment?.meta?.githubCommitRef ?? "";

  const text = [
    `[keepioo] ⚠ Vercel deploy 실패`,
    `프로젝트: ${project} / target: ${target}`,
    ref ? `브랜치: ${ref}` : "",
    commitMsg ? `commit: ${commitMsg.slice(0, 100)}` : "",
    url ? `https://${url}` : "",
    "",
    "권고: vercel.com/keeper0301-8938s-projects/government-information/deployments 에서 로그 확인",
    "직전 commit 으로 rollback 하려면 git revert HEAD + push",
  ]
    .filter(Boolean)
    .join("\n");

  await notifyTelegram(text);

  try {
    await logAdminAction({
      actorId: null,
      action: "vercel_deploy_failed",
      details: { project, target, url, commitMsg, ref, type: payload.type },
    });
  } catch (e) {
    console.warn("[vercel-deploy-webhook] audit 실패:", e);
  }

  return NextResponse.json({ ok: true, notified: true });
}
