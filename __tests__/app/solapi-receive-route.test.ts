import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/webhook/solapi-receive/route";
import { handleSmsReply } from "@/lib/sms/decision-router";

vi.mock("@/lib/sms/decision-router", () => ({
  handleSmsReply: vi.fn(),
}));

const OLD_SOLAPI_WEBHOOK_SECRET = process.env.SOLAPI_WEBHOOK_SECRET;
const OLD_OPS_ALERT_DISABLE_SMS = process.env.OPS_ALERT_DISABLE_SMS;

function restoreEnv() {
  restoreEnvValue("SOLAPI_WEBHOOK_SECRET", OLD_SOLAPI_WEBHOOK_SECRET);
  restoreEnvValue("OPS_ALERT_DISABLE_SMS", OLD_OPS_ALERT_DISABLE_SMS);
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
    .createHmac("sha256", "solapi-secret")
    .update(rawBody)
    .digest("hex");
}

function solapiRequest(rawBody: string, signature = signBody(rawBody)) {
  return new Request("https://www.keepioo.com/api/webhook/solapi-receive", {
    method: "POST",
    headers: {
      "x-solapi-signature": signature,
    },
    body: rawBody,
  }) as NextRequest;
}

function solapiAuthorizationRequest(rawBody: string, signature = signBody(rawBody)) {
  return new Request("https://www.keepioo.com/api/webhook/solapi-receive", {
    method: "POST",
    headers: {
      authorization: signature,
    },
    body: rawBody,
  }) as NextRequest;
}

function setRequiredWebhookEnv() {
  process.env.SOLAPI_WEBHOOK_SECRET = "solapi-secret";
  delete process.env.OPS_ALERT_DISABLE_SMS;
}

describe("solapi-receive route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("서명이 틀리면 문자 답장 처리를 실행하지 않는다", async () => {
    setRequiredWebhookEnv();

    const response = await POST(
      solapiRequest(JSON.stringify({ message: { from: "01012345678", text: "1" } }), "wrong"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(handleSmsReply).not.toHaveBeenCalled();
  });

  it("웹훅 비밀값이 없으면 문자 답장 처리를 실행하지 않는다", async () => {
    delete process.env.SOLAPI_WEBHOOK_SECRET;
    delete process.env.OPS_ALERT_DISABLE_SMS;

    const response = await POST(
      solapiRequest(JSON.stringify({ message: { from: "01012345678", text: "1" } })),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(handleSmsReply).not.toHaveBeenCalled();
  });

  it("JSON 파싱에 실패하면 문자 답장 처리를 실행하지 않는다", async () => {
    setRequiredWebhookEnv();

    const response = await POST(solapiRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_json" });
    expect(handleSmsReply).not.toHaveBeenCalled();
  });

  it("발신번호나 본문이 없으면 문자 답장 처리를 실행하지 않는다", async () => {
    setRequiredWebhookEnv();
    const rawBody = JSON.stringify({ message: { from: "01012345678" } });

    const response = await POST(solapiRequest(rawBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing_message_fields",
    });
    expect(handleSmsReply).not.toHaveBeenCalled();
  });

  it("문자 운영이 꺼져 있으면 문자 답장 처리를 실행하지 않는다", async () => {
    setRequiredWebhookEnv();
    process.env.OPS_ALERT_DISABLE_SMS = "true";
    const rawBody = JSON.stringify({
      message: { from: "01012345678", text: "1" },
    });

    const response = await POST(solapiRequest(rawBody));
    const body = (await response.json()) as { ok: boolean; reason: string };

    expect(body.ok).toBe(false);
    expect(body.reason).toBe("sms_disabled");
    expect(handleSmsReply).not.toHaveBeenCalled();
  });

  it("정상 문자 답장은 처리 함수로 전달하고 결과를 반환한다", async () => {
    setRequiredWebhookEnv();
    vi.mocked(handleSmsReply).mockResolvedValue({
      ok: true,
      reason: "approved",
    });
    const rawBody = JSON.stringify({
      message: { from: "01012345678", text: "1" },
    });

    const response = await POST(solapiRequest(rawBody));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      reason: "approved",
    });
    expect(handleSmsReply).toHaveBeenCalledWith({
      from: "01012345678",
      text: "1",
    });
  });

  it("sha256 접두사가 붙은 서명도 허용한다", async () => {
    setRequiredWebhookEnv();
    vi.mocked(handleSmsReply).mockResolvedValue({
      ok: true,
      reason: "approved",
    });
    const rawBody = JSON.stringify({
      message: { from: "01012345678", text: "1" },
    });

    const response = await POST(solapiRequest(rawBody, `sha256=${signBody(rawBody)}`));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      reason: "approved",
    });
    expect(handleSmsReply).toHaveBeenCalledWith({
      from: "01012345678",
      text: "1",
    });
  });

  it("authorization 헤더로 온 서명도 허용한다", async () => {
    setRequiredWebhookEnv();
    vi.mocked(handleSmsReply).mockResolvedValue({
      ok: true,
      reason: "approved",
    });
    const rawBody = JSON.stringify({
      message: { from: "01012345678", text: "2" },
    });

    const response = await POST(solapiAuthorizationRequest(rawBody));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      reason: "approved",
    });
    expect(handleSmsReply).toHaveBeenCalledWith({
      from: "01012345678",
      text: "2",
    });
  });
});
