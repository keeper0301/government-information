import { describe, expect, it, vi } from "vitest";
import { POST as alarmPost, DELETE as alarmDelete } from "@/app/api/alarm/route";
import { POST as pushSubscribe, DELETE as pushUnsubscribe } from "@/app/api/push/subscribe/route";
import { POST as pushTrackClick } from "@/app/api/push/track-click/route";
import { POST as alertRulePost } from "@/app/api/alert-rules/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/subscription", () => ({
  requireTier: vi.fn(),
}));

function req(url: string, body: string, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

const oversized = JSON.stringify({ data: "x".repeat(20 * 1024) });

describe("remaining user-facing JSON body limits", () => {
  it("caps alarm create/delete bodies before auth/database work", async () => {
    const create = await alarmPost(req("https://www.keepioo.com/api/alarm", oversized) as never);
    const remove = await alarmDelete(req("https://www.keepioo.com/api/alarm", oversized, "DELETE") as never);

    expect(create.status).toBe(413);
    expect(remove.status).toBe(413);
  });

  it("caps push subscription create/delete bodies", async () => {
    const create = await pushSubscribe(req("https://www.keepioo.com/api/push/subscribe", oversized));
    const remove = await pushUnsubscribe(req("https://www.keepioo.com/api/push/subscribe", oversized, "DELETE"));

    expect(create.status).toBe(413);
    expect(remove.status).toBe(413);
  });

  it("caps push click tracking bodies", async () => {
    const res = await pushTrackClick(req("https://www.keepioo.com/api/push/track-click", oversized));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "body_too_large" });
  });

  it("caps alert rule create/preview bodies before auth", async () => {
    const res = await alertRulePost(req("https://www.keepioo.com/api/alert-rules", oversized) as never);

    expect(res.status).toBe(413);
  });
});
