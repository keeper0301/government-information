import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishBlogCommand, publishIndexnowCommand } from "@/lib/telegram/admin/content";
import { healthCommand } from "@/lib/telegram/admin/info";
import { statusCommand, triggerCommand } from "@/lib/telegram/admin/operate";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/press-ingest/candidates", () => ({
  revokeAutoConfirmed: vi.fn(),
  restoreAutoConfirmed: vi.fn(),
  listAutoConfirmedPolicies: vi.fn(),
}));

const missingSecretMessage = "❌ CRON_SECRET 비밀값이 설정되지 않았습니다.";

describe("텔레그램 관리자 명령 크론 인증", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("블로그 발행 명령은 인증 헤더가 없으면 호출하지 않는다", async () => {
    const reply = await publishBlogCommand("청년", null);

    expect(reply).toBe(missingSecretMessage);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("색인 제출 명령은 인증 헤더가 없으면 호출하지 않는다", async () => {
    const reply = await publishIndexnowCommand(null);

    expect(reply).toBe(missingSecretMessage);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("헬스 명령은 인증 헤더가 없으면 호출하지 않는다", async () => {
    const reply = await healthCommand(null);

    expect(reply).toBe(missingSecretMessage);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("상태 명령은 인증 헤더가 없으면 호출하지 않는다", async () => {
    const reply = await statusCommand(null);

    expect(reply).toBe(missingSecretMessage);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("트리거 명령은 인증 헤더가 없으면 호출하지 않는다", async () => {
    const reply = await triggerCommand("health-alert", null);

    expect(reply).toBe(missingSecretMessage);
    expect(fetch).not.toHaveBeenCalled();
  });
});
