import { describe, expect, it, vi } from "vitest";

describe("outer-gateway", () => {
  it("CRON_SECRET을 아우터 인증 토큰으로 재사용할 수 있다", async () => {
    const { readOuterGatewayConfig } = await import("../../tools/outer-gateway.mjs");

    const config = readOuterGatewayConfig({
      OUTER_USE_CRON_SECRET: "true",
      CRON_SECRET: "cron-secret",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.authToken).toBe("cron-secret");
    expect(config.mode).toBe("rules");
  });

  it("업스트림 주소와 토큰이 있으면 프록시 모드로 동작한다", async () => {
    const { readOuterGatewayConfig } = await import("../../tools/outer-gateway.mjs");

    const config = readOuterGatewayConfig({
      OUTER_AUTH_TOKEN: "outer-token",
      OUTER_UPSTREAM_BASE_URL: "https://upstream.example.com/v1/",
      OUTER_UPSTREAM_AUTH_TOKEN: "upstream-token",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.mode).toBe("proxy");
    expect(config.upstreamBaseUrl).toBe("https://upstream.example.com/v1");
  });

  it("업스트림 토큰이 없으면 기존 OpenAI 키를 쓸 수 있다", async () => {
    const { readOuterGatewayConfig } = await import("../../tools/outer-gateway.mjs");

    const config = readOuterGatewayConfig({
      OUTER_UPSTREAM_BASE_URL: "https://api.openai.com/v1",
      OPENAI_API_KEY: "openai-token",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.mode).toBe("proxy");
    expect(config.upstreamAuthToken).toBe("openai-token");
  });

  it("규칙 모드는 사이트 장애를 긴급 판단으로 반환한다", async () => {
    const { handleOuterResponsesRequest } = await import("../../tools/outer-gateway.mjs");
    const response = createResponseRecorder();

    await handleOuterResponsesRequest({
      req: createRequest({
        token: "outer-token",
        body: {
          input: [
            {
              role: "user",
              content: JSON.stringify({
                site: { ok: false },
                cycle: { ok: true },
              }),
            },
          ],
        },
      }),
      res: response.res,
      config: {
        enabled: true,
        authToken: "outer-token",
        mode: "rules",
        upstreamBaseUrl: "",
        upstreamAuthToken: "",
        upstreamModel: "gpt-5.2",
      },
    });

    const body = JSON.parse(response.body);
    const decision = JSON.parse(body.output_text);
    expect(response.status).toBe(200);
    expect(decision.severity).toBe("urgent");
  });

  it("인증 토큰이 틀리면 거절한다", async () => {
    const { handleOuterResponsesRequest } = await import("../../tools/outer-gateway.mjs");
    const response = createResponseRecorder();

    await handleOuterResponsesRequest({
      req: createRequest({ token: "wrong-token", body: {} }),
      res: response.res,
      config: {
        enabled: true,
        authToken: "outer-token",
        mode: "rules",
        upstreamBaseUrl: "",
        upstreamAuthToken: "",
        upstreamModel: "gpt-5.2",
      },
    });

    expect(response.status).toBe(401);
  });

  it("프록시 모드는 업스트림 responses로 전달한다", async () => {
    const { handleOuterResponsesRequest } = await import("../../tools/outer-gateway.mjs");
    const response = createResponseRecorder();
    const fetchMock = vi.fn(async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: "resp_test", output_text: "{}" }),
    }));

    await handleOuterResponsesRequest({
      req: createRequest({ token: "outer-token", body: { input: [] } }),
      res: response.res,
      config: {
        enabled: true,
        authToken: "outer-token",
        mode: "proxy",
        upstreamBaseUrl: "https://upstream.example.com/v1",
        upstreamAuthToken: "upstream-token",
        upstreamModel: "gpt-5.2",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://upstream.example.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer upstream-token",
        }),
      }),
    );
  });
});

function createRequest({ token, body }: { token: string; body: unknown }) {
  const chunks = [Buffer.from(JSON.stringify(body))];
  return {
    headers: { authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  } as never;
}

function createResponseRecorder() {
  const recorder = {
    status: 0,
    body: "",
    res: {
      writeHead(status: number) {
        recorder.status = status;
      },
      end(body: string) {
        recorder.body = body;
      },
    },
  };
  return recorder as {
    status: number;
    body: string;
    res: never;
  };
}
