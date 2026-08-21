import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/webhook/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/toss";

vi.mock("@/lib/toss", () => ({
  TossError: class TossError extends Error {
    code: string;
    constructor(code = "TOSS_ERROR") {
      super(code);
      this.code = code;
    }
  },
  getPayment: vi.fn(),
}));

const paymentHistoryUpdateEqMock = vi.fn();
const paymentHistoryUpdateMock = vi.fn(() => ({ eq: paymentHistoryUpdateEqMock }));
const paymentHistoryMaybeSingleMock = vi.fn();
const paymentHistorySelectEqMock = vi.fn(() => ({ maybeSingle: paymentHistoryMaybeSingleMock }));
const paymentHistorySelectMock = vi.fn(() => ({ eq: paymentHistorySelectEqMock }));

const subscriptionUpdateEqStatusMock = vi.fn();
const subscriptionUpdateEqUserMock = vi.fn(() => ({ eq: subscriptionUpdateEqStatusMock }));
const subscriptionUpdateMock = vi.fn(() => ({ eq: subscriptionUpdateEqUserMock }));

const fromMock = vi.fn((table: string) => {
  if (table === "payment_history") {
    return {
      update: paymentHistoryUpdateMock,
      select: paymentHistorySelectMock,
    };
  }
  if (table === "subscriptions") {
    return {
      update: subscriptionUpdateMock,
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
}));

function webhookRequest() {
  return new Request("https://www.keepioo.com/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-08-21T00:00:00.000Z",
      data: { paymentKey: "pay_1", orderId: "order_1", status: "DONE" },
    }),
  });
}

describe("billing webhook subscription activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPayment).mockResolvedValue({
      paymentKey: "pay_1",
      orderId: "order_1",
      status: "DONE",
      approvedAt: "2026-08-21T00:00:00.000Z",
    } as never);
    paymentHistoryMaybeSingleMock.mockResolvedValue({ data: { user_id: "user-basic" }, error: null });
  });

  it("promotes only past_due subscriptions to active after Toss DONE readback", async () => {
    const res = await POST(webhookRequest() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "success" });
    expect(getPayment).toHaveBeenCalledWith("pay_1");
    expect(createAdminClient).toHaveBeenCalled();
    expect(paymentHistoryUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "DONE",
      paid_at: "2026-08-21T00:00:00.000Z",
    }));
    expect(subscriptionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "active",
      trial_ends_at: null,
    }));
    expect(subscriptionUpdateEqUserMock).toHaveBeenCalledWith("user_id", "user-basic");
    expect(subscriptionUpdateEqStatusMock).toHaveBeenCalledWith("status", "past_due");
  });
});
