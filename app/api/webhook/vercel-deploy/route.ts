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
import { getCronAuthorizationHeader } from "@/lib/cron-auth";
import { isJsonBodyTooLargeError, readTextWithLimit } from "@/lib/http/json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

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

const CANONICAL_ORIGIN = "https://www.keepioo.com";
const DEPLOY_SMOKE_PATHS = [
  { path: "/login", cache: "public, s-maxage=3600" },
  { path: "/signup", cache: "public, s-maxage=3600" },
  { path: "/help", cache: "public, s-maxage=86400" },
  { path: "/guides", cache: "public, s-maxage=60" },
  { path: "/admin", cache: "private" },
  { path: "/?ref=ABCDEF", cache: "private" },
];

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
  const authorizationHeader = getCronAuthorizationHeader();
  if (!authorizationHeader) return;

  await fetch("https://www.keepioo.com/api/notify-telegram", {
    method: "POST",
    headers: {
      Authorization: authorizationHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  }).catch(() => undefined);
}

async function runProductionSmoke(): Promise<{
  ok: boolean;
  lines: string[];
}> {
  const lines: string[] = [];
  let ok = true;

  for (const item of DEPLOY_SMOKE_PATHS) {
    try {
      const response = await fetch(`${CANONICAL_ORIGIN}${item.path}`, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "keepioo-vercel-deploy-smoke/1.0" },
      });
      const cache = response.headers.get("cache-control") ?? "";
      const pass = response.status < 500 && cache.toLowerCase().includes(item.cache.toLowerCase());
      ok &&= pass;
      lines.push(`${pass ? "✓" : "✗"} ${item.path} ${response.status} ${cache || "cache-control 없음"}`);
    } catch (error) {
      ok = false;
      lines.push(`✗ ${item.path} smoke 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ok, lines };
}

export async function POST(request: NextRequest) {
  // raw body 로 받음 (서명 검증용)
  let rawBody: string;
  try {
    rawBody = await readTextWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? "body_too_large" : "invalid_body" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }
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

  const isFailureEvent =
    payload.type === "deployment.error" || payload.type === "deployment.failed";
  const isSuccessEvent =
    payload.type === "deployment.succeeded" || payload.type === "deployment.ready";
  const target = payload.payload?.target ?? "unknown";

  if (!isFailureEvent && !isSuccessEvent) {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }

  if (isSuccessEvent && target !== "production") {
    return NextResponse.json({ ok: true, ignored: payload.type, target });
  }

  const project = payload.payload?.project?.name ?? "unknown";
  const url = payload.payload?.deployment?.url ?? "";
  const commitMsg = payload.payload?.deployment?.meta?.githubCommitMessage ?? "";
  const ref = payload.payload?.deployment?.meta?.githubCommitRef ?? "";

  if (isFailureEvent) {
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

  const smoke = await runProductionSmoke();
  const text = [
    smoke.ok ? `[keepioo] ✅ production deploy 완료 + smoke 통과` : `[keepioo] ⚠ production deploy 완료 후 smoke 실패`,
    `프로젝트: ${project} / target: ${target}`,
    ref ? `브랜치: ${ref}` : "",
    commitMsg ? `commit: ${commitMsg.slice(0, 100)}` : "",
    url ? `https://${url}` : "",
    "",
    ...smoke.lines,
  ]
    .filter(Boolean)
    .join("\n");

  await notifyTelegram(text);

  try {
    await logAdminAction({
      actorId: null,
      action: smoke.ok ? "vercel_deploy_smoke_passed" : "vercel_deploy_smoke_failed",
      details: { project, target, url, commitMsg, ref, type: payload.type, smoke },
    });
  } catch (e) {
    console.warn("[vercel-deploy-webhook] audit 실패:", e);
  }

  return NextResponse.json({ ok: smoke.ok, notified: true, smoke });
}
