import { describe, expect, it, vi } from "vitest";

describe("resident-monitor", () => {
  it("텔레그램 수신자 목록을 중복 없이 합친다", async () => {
    const { parseOwnerChatIds } = await import("../../tools/resident-monitor.mjs");

    const ids = parseOwnerChatIds({
      TELEGRAM_OWNER_CHAT_IDS: "100, 200,100",
      TELEGRAM_CHAT_ID: "300",
    } as unknown as NodeJS.ProcessEnv);

    expect(ids).toEqual(["100", "200", "300"]);
  });

  it("주요 페이지가 모두 정상이면 사이트 정상으로 본다", async () => {
    const { checkPublicSite } = await import("../../tools/resident-monitor.mjs");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: { cancel: vi.fn(async () => undefined) },
    }));

    const result = await checkPublicSite({
      baseUrl: "https://www.keepioo.com",
      paths: [{ path: "/", label: "홈" }],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.keepioo.com/",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("주요 페이지가 실패하면 장애 알림 본문을 만든다", async () => {
    const { buildSiteDownAlert } = await import("../../tools/resident-monitor.mjs");

    const alert = buildSiteDownAlert({
      baseUrl: "https://www.keepioo.com",
      consecutiveFailures: 2,
      site: {
        ok: false,
        checkedAt: "2026-06-02T00:00:00.000Z",
        checked: 1,
        failed: 1,
        slow: 0,
        results: [
          {
            path: "/",
            label: "홈",
            ok: false,
            status: 503,
            durationMs: 10,
          },
        ],
      },
    });

    expect(alert?.subject).toContain("2회 연속");
    expect(alert?.message).toContain("홈(503)");
    expect(alert?.message).toContain("Vercel");
  });

  it("텔레그램 설정이 없으면 알림을 건너뛴다", async () => {
    const { sendTelegramAlert } = await import("../../tools/resident-monitor.mjs");

    const result = await sendTelegramAlert({
      token: "",
      chatIds: [],
      subject: "제목",
      message: "본문",
    });

    expect(result).toEqual({ ok: false, reason: "skipped_no_credentials" });
  });
});
