import { describe, expect, it, vi } from "vitest";

describe("autonomous-ai-manager", () => {
  it("환경변수에서 AI 상주 관리자 설정을 읽는다", async () => {
    const { readAiManagerConfig } = await import(
      "../../tools/autonomous-ai-manager.mjs"
    );

    const config = readAiManagerConfig({
      AI_MANAGER_ENABLED: "true",
      OUTER_AUTH_TOKEN: "test-token",
      OUTER_BASE_URL: "https://outer.example.com/v1/",
      OUTER_MODEL: "test-model",
      AI_MANAGER_PERMISSION_LEVEL: "full_safe",
      AI_MANAGER_INTERVAL_MS: "600000",
    } as unknown as NodeJS.ProcessEnv);

    expect(config).toEqual({
      enabled: true,
      authToken: "test-token",
      baseUrl: "https://outer.example.com/v1",
      model: "test-model",
      permissionLevel: "full_safe",
      intervalMs: 600000,
    });
  });

  it("사이트 장애가 있으면 AI 판단을 즉시 실행 대상으로 본다", async () => {
    const { shouldRunAiManager } = await import(
      "../../tools/autonomous-ai-manager.mjs"
    );

    expect(
      shouldRunAiManager({
        nowMs: 1000,
        lastRunAt: "2026-06-02T00:00:00.000Z",
        intervalMs: 1800000,
        site: { ok: false },
      }),
    ).toBe(true);
  });

  it("아우터 응답을 운영 판단으로 변환한다", async () => {
    const { runAiManager, buildManagerAlert } = await import(
      "../../tools/autonomous-ai-manager.mjs"
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "resp_test",
        output_text: JSON.stringify({
          severity: "urgent",
          summary: "홈 페이지 장애가 감지되었습니다.",
          actions: ["Vercel 배포 상태 확인", "Supabase 연결 상태 확인"],
          auto_execute_allowed: false,
        }),
      }),
    }));

    const result = await runAiManager({
      config: {
        enabled: true,
        authToken: "test-token",
        baseUrl: "https://outer.example.com/v1",
        model: "test-model",
        permissionLevel: "full_safe",
        intervalMs: 1800000,
      },
      site: { ok: false },
      cycle: { ok: true },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.decision?.severity).toBe("urgent");
    expect(buildManagerAlert(result)?.message).toContain("Vercel 배포 상태 확인");
  });

  it("인증 토큰이 없으면 AI 판단을 건너뛴다", async () => {
    const { runAiManager } = await import(
      "../../tools/autonomous-ai-manager.mjs"
    );

    const result = await runAiManager({
      config: {
        enabled: true,
        authToken: "",
        baseUrl: "https://outer.example.com/v1",
        model: "test-model",
        permissionLevel: "expanded",
        intervalMs: 1800000,
      },
      site: { ok: true },
      cycle: { ok: true },
    });

    expect(result).toEqual({
      ok: false,
      skipped: true,
      reason: "missing_outer_auth_token",
    });
  });

  it("아우터 주소가 없으면 AI 판단을 건너뛴다", async () => {
    const { runAiManager } = await import(
      "../../tools/autonomous-ai-manager.mjs"
    );

    const result = await runAiManager({
      config: {
        enabled: true,
        authToken: "test-token",
        baseUrl: "",
        model: "test-model",
        permissionLevel: "expanded",
        intervalMs: 1800000,
      },
      site: { ok: true },
      cycle: { ok: true },
    });

    expect(result).toEqual({
      ok: false,
      skipped: true,
      reason: "missing_outer_base_url",
    });
  });

  it("OpenAI 환경변수만 있으면 아우터 설정으로 인정하지 않는다", async () => {
    const { readAiManagerConfig } = await import(
      "../../tools/autonomous-ai-manager.mjs"
    );

    const config = readAiManagerConfig({
      AI_MANAGER_ENABLED: "true",
      OPENAI_AUTH_TOKEN: "openai-token",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "openai-model",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.authToken).toBe("");
    expect(config.baseUrl).toBe("");
    expect(config.model).toBe("gpt-5.2");
  });
});
