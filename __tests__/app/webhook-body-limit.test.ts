import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as billingWebhook } from "@/app/api/billing/webhook/route";
import { POST as telegramWebhook } from "@/app/api/webhook/telegram-receive/route";
import { POST as solapiWebhook } from "@/app/api/webhook/solapi-receive/route";
import { POST as vercelDeployWebhook } from "@/app/api/webhook/vercel-deploy/route";
import { POST as vercelDeploymentWebhook } from "@/app/api/webhooks/vercel-deployment/route";

vi.mock("@/lib/toss", () => ({
  getPayment: vi.fn(),
  TossError: class TossError extends Error {
    code = "TEST";
  },
}));

vi.mock("@/lib/telegram/commands", () => ({
  dispatchCommand: vi.fn(),
}));

vi.mock("@/lib/sms/decision-router", () => ({
  handleSmsReply: vi.fn(),
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({ limit: async () => ({ data: [] }) }),
          }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
      update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
    }),
  }),
}));

vi.mock("@/lib/adsense/deployment-message", () => ({
  notifyAdsenseDeploymentResult: vi.fn(),
}));

function request(url: string, body: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers, body });
}

const OLD_ENV = {
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_OWNER_CHAT_IDS: process.env.TELEGRAM_OWNER_CHAT_IDS,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
};

function restoreEnvValue(key: keyof typeof OLD_ENV) {
  const value = OLD_ENV[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restoreEnvValue("TELEGRAM_WEBHOOK_SECRET");
  restoreEnvValue("TELEGRAM_OWNER_CHAT_IDS");
  restoreEnvValue("TELEGRAM_BOT_TOKEN");
  restoreEnvValue("CRON_SECRET");
});

describe("webhook body limits", () => {
  it("caps Toss billing webhook JSON bodies", async () => {
    const res = await billingWebhook(request(
      "https://www.keepioo.com/api/billing/webhook",
      JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "x".repeat(70 * 1024) } }),
      { "content-type": "application/json" },
    ) as never);

    expect(res.status).toBe(413);
  });

  it("caps Telegram webhook JSON bodies after webhook auth", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret";
    process.env.TELEGRAM_OWNER_CHAT_IDS = "123";
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.CRON_SECRET = "cron-secret";

    const res = await telegramWebhook(request(
      "https://www.keepioo.com/api/webhook/telegram-receive",
      JSON.stringify({ update_id: 1, message: { chat: { id: 123 }, text: "x".repeat(70 * 1024) } }),
      {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "webhook-secret",
      },
    ) as never);

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "body_too_large" });
  });

  it("caps raw signed webhook bodies before signature verification", async () => {
    const big = "x".repeat(70 * 1024);

    await expect(Promise.all([
      solapiWebhook(request("https://www.keepioo.com/api/webhook/solapi-receive", big, { "x-solapi-signature": "wrong" }) as never),
      vercelDeployWebhook(request("https://www.keepioo.com/api/webhook/vercel-deploy", big, { "x-vercel-signature": "wrong" }) as never),
      vercelDeploymentWebhook(request("https://www.keepioo.com/api/webhooks/vercel-deployment", big, { "x-vercel-signature": "wrong" })),
    ])).resolves.toSatisfy((responses: Response[]) => responses.every((res) => res.status === 413));
  });
});
