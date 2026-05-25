import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/webhook/telegram-receive/route";
import { dispatchCommand } from "@/lib/telegram/commands";

vi.mock("@/lib/telegram/commands", () => ({
  dispatchCommand: vi.fn(),
}));

const OLD_TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const OLD_TELEGRAM_OWNER_CHAT_IDS = process.env.TELEGRAM_OWNER_CHAT_IDS;
const OLD_TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const OLD_TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OLD_CRON_SECRET = process.env.CRON_SECRET;

function restoreEnv() {
  restoreEnvValue("TELEGRAM_WEBHOOK_SECRET", OLD_TELEGRAM_WEBHOOK_SECRET);
  restoreEnvValue("TELEGRAM_OWNER_CHAT_IDS", OLD_TELEGRAM_OWNER_CHAT_IDS);
  restoreEnvValue("TELEGRAM_CHAT_ID", OLD_TELEGRAM_CHAT_ID);
  restoreEnvValue("TELEGRAM_BOT_TOKEN", OLD_TELEGRAM_BOT_TOKEN);
  restoreEnvValue("CRON_SECRET", OLD_CRON_SECRET);
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function telegramRequest(body: unknown) {
  return new Request("https://www.keepioo.com/api/webhook/telegram-receive", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "webhook-secret",
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function invalidJsonRequest() {
  return new Request("https://www.keepioo.com/api/webhook/telegram-receive", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "webhook-secret",
    },
    body: "{",
  }) as NextRequest;
}

function setRequiredWebhookEnv() {
  process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret";
  process.env.TELEGRAM_OWNER_CHAT_IDS = "123";
  delete process.env.TELEGRAM_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.CRON_SECRET = "cron-secret";
}

describe("telegram-receive route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("허용된 채팅의 명령에 크론 인증 헤더를 붙여 분배하고 답장을 보낸다", async () => {
    setRequiredWebhookEnv();

    vi.mocked(dispatchCommand).mockResolvedValue("처리 완료");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      telegramRequest({
        update_id: 1,
        message: {
          chat: { id: 123, type: "private" },
          text: "/status",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true, replied: true });
    expect(dispatchCommand).toHaveBeenCalledWith({
      chatId: 123,
      text: "/status",
      cronAuthorizationHeader: "Bearer cron-secret",
      role: "owner",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: 123, text: "처리 완료" }),
      },
    );
  });

  it("허용되지 않은 채팅은 명령을 실행하지 않는다", async () => {
    setRequiredWebhookEnv();

    const response = await POST(
      telegramRequest({
        update_id: 1,
        message: {
          chat: { id: 999, type: "private" },
          text: "/status",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "not_whitelisted",
    });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("잘못된 JSON 요청은 명령을 실행하지 않고 오류를 반환한다", async () => {
    setRequiredWebhookEnv();

    const response = await POST(invalidJsonRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid_json",
    });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("웹훅 비밀값이 설정되지 않으면 명령을 실행하지 않는다", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_OWNER_CHAT_IDS = "123";
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.CRON_SECRET = "cron-secret";

    const response = await POST(
      telegramRequest({
        update_id: 1,
        message: {
          chat: { id: 123, type: "private" },
          text: "/status",
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "TELEGRAM_WEBHOOK_SECRET 비밀값이 설정되지 않았습니다.",
    });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("웹훅 비밀값이 다르면 명령을 실행하지 않는다", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";
    process.env.TELEGRAM_OWNER_CHAT_IDS = "123";
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.CRON_SECRET = "cron-secret";

    const response = await POST(
      telegramRequest({
        update_id: 1,
        message: {
          chat: { id: 123, type: "private" },
          text: "/status",
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "인증에 실패했습니다.",
    });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("텍스트 메시지가 아니면 명령을 실행하지 않고 건너뛴다", async () => {
    setRequiredWebhookEnv();

    const response = await POST(
      telegramRequest({
        update_id: 1,
        message: {
          chat: { id: 123, type: "private" },
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "no_text_message",
    });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });
});
