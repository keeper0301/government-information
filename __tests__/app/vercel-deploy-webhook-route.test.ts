import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/webhook/vercel-deploy/route";
import { logAdminAction } from "@/lib/admin-actions";

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: vi.fn(),
}));

const OLD_VERCEL_WEBHOOK_SECRET = process.env.VERCEL_WEBHOOK_SECRET;
const OLD_CRON_SECRET = process.env.CRON_SECRET;

function restoreEnv() {
  restoreEnvValue("VERCEL_WEBHOOK_SECRET", OLD_VERCEL_WEBHOOK_SECRET);
  restoreEnvValue("CRON_SECRET", OLD_CRON_SECRET);
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function signBody(rawBody: string) {
  return crypto
    .createHmac("sha1", "vercel-secret")
    .update(rawBody)
    .digest("hex");
}

function vercelRequest(rawBody: string, signature = signBody(rawBody)) {
  return new Request("https://www.keepioo.com/api/webhook/vercel-deploy", {
    method: "POST",
    headers: {
      "x-vercel-signature": signature,
    },
    body: rawBody,
  }) as NextRequest;
}

function setRequiredWebhookEnv() {
  process.env.VERCEL_WEBHOOK_SECRET = "vercel-secret";
  process.env.CRON_SECRET = "cron-secret";
}

describe("vercel-deploy webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it("서명이 틀리면 알림과 감사 로그를 실행하지 않는다", async () => {
    setRequiredWebhookEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      vercelRequest(JSON.stringify({ type: "deployment.failed" }), "wrong-signature"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("JSON 파싱에 실패하면 알림과 감사 로그를 실행하지 않는다", async () => {
    setRequiredWebhookEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(vercelRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_json" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("실패 이벤트가 아니면 조용히 무시한다", async () => {
    setRequiredWebhookEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const rawBody = JSON.stringify({ type: "deployment.ready" });

    const response = await POST(vercelRequest(rawBody));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: "deployment.ready",
      target: "unknown",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("실패 이벤트는 텔레그램 알림과 감사 로그를 남긴다", async () => {
    setRequiredWebhookEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(logAdminAction).mockResolvedValue(undefined);
    const rawBody = JSON.stringify({
      type: "deployment.failed",
      payload: {
        project: { name: "government-information" },
        target: "production",
        deployment: {
          url: "keepioo.vercel.app",
          meta: {
            githubCommitMessage: "테스트 커밋",
            githubCommitRef: "main",
          },
        },
      },
    });

    const response = await POST(vercelRequest(rawBody));

    await expect(response.json()).resolves.toEqual({ ok: true, notified: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/api/notify-telegram",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer cron-secret",
          "Content-Type": "application/json",
        },
      }),
    );
    const fetchBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      text: string;
    };
    expect(fetchBody.text).toContain("government-information");
    expect(fetchBody.text).toContain("main");
    expect(fetchBody.text).toContain("테스트 커밋");
    expect(logAdminAction).toHaveBeenCalledWith({
      actorId: null,
      action: "vercel_deploy_failed",
      details: {
        project: "government-information",
        target: "production",
        url: "keepioo.vercel.app",
        commitMsg: "테스트 커밋",
        ref: "main",
        type: "deployment.failed",
      },
    });
  });

  it("production 성공 이벤트는 핵심 경로 smoke 후 텔레그램 알림과 감사 로그를 남긴다", async () => {
    setRequiredWebhookEnv();
    const headerResponse = (cacheControl: string, status = 200, body: string | null = null) =>
      new Response(body, { status, headers: { "cache-control": cacheControl } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        headerResponse(
          "public, s-maxage=3600, stale-while-revalidate=31532400",
          200,
          "관심 지역·정책 알림을 놓치지 않게 저장해드려요",
        ),
      )
      .mockResolvedValueOnce(
        headerResponse(
          "public, s-maxage=3600, stale-while-revalidate=31532400",
          200,
          "무료로 맞춤 정책 알림 시작하기",
        ),
      )
      .mockResolvedValueOnce(headerResponse("public, s-maxage=86400, stale-while-revalidate=31449600"))
      .mockResolvedValueOnce(headerResponse("public, s-maxage=60, stale-while-revalidate=31535940"))
      .mockResolvedValueOnce(headerResponse("private, no-store", 307))
      .mockResolvedValueOnce(headerResponse("private, no-cache, no-store, max-age=0, must-revalidate"))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(logAdminAction).mockResolvedValue(undefined);
    const rawBody = JSON.stringify({
      type: "deployment.succeeded",
      payload: {
        project: { name: "government-information" },
        target: "production",
        deployment: {
          url: "keepioo.vercel.app",
          meta: {
            githubCommitMessage: "성공 커밋",
            githubCommitRef: "master",
          },
        },
      },
    });

    const response = await POST(vercelRequest(rawBody));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.smoke.lines).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://www.keepioo.com/login",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    const notifyBody = JSON.parse(fetchMock.mock.calls[6][1].body as string) as { text: string };
    expect(notifyBody.text).toContain("production deploy 완료 + smoke 통과");
    expect(notifyBody.text).toContain("/login");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "vercel_deploy_smoke_passed",
        details: expect.objectContaining({ target: "production" }),
      }),
    );
  });
});
