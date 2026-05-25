import { afterEach, describe, expect, it } from "vitest";
import { authorizeTelegramWebhookRequest } from "@/lib/telegram-webhook-auth";

const OLD_TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

function requestWithSecret(secret?: string) {
  return new Request("https://www.keepioo.com/api/webhook/telegram-receive", {
    headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
  });
}

async function readError(response: Response) {
  return (await response.json()) as { error: string };
}

function restoreTelegramWebhookSecret() {
  if (OLD_TELEGRAM_WEBHOOK_SECRET === undefined) {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    return;
  }

  process.env.TELEGRAM_WEBHOOK_SECRET = OLD_TELEGRAM_WEBHOOK_SECRET;
}

describe("authorizeTelegramWebhookRequest", () => {
  afterEach(() => {
    restoreTelegramWebhookSecret();
  });

  it("텔레그램 웹훅 비밀값이 없으면 서버 오류를 반환한다", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = authorizeTelegramWebhookRequest(requestWithSecret("secret"));

    expect(response?.status).toBe(500);
    await expect(readError(response!)).resolves.toEqual({
      error: "TELEGRAM_WEBHOOK_SECRET 비밀값이 설정되지 않았습니다.",
    });
  });

  it("텔레그램 웹훅 비밀값이 다르면 인증 실패를 반환한다", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";

    const response = authorizeTelegramWebhookRequest(requestWithSecret("wrong-secret"));

    expect(response?.status).toBe(401);
    await expect(readError(response!)).resolves.toEqual({
      error: "인증에 실패했습니다.",
    });
  });

  it("텔레그램 웹훅 비밀값이 맞으면 null을 반환한다", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";

    const response = authorizeTelegramWebhookRequest(requestWithSecret("right-secret"));

    expect(response).toBeNull();
  });
});
