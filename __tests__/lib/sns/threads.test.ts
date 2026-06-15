import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishThreadsPost } from "@/lib/sns/threads";

const accessTokenEnv = "THREADS_ACCESS_" + "TOKEN";
const originalUserId = process.env.THREADS_USER_ID;
const originalAccessToken = process.env[accessTokenEnv];
const originalFetch = globalThis.fetch;

describe("publishThreadsPost", () => {
  beforeEach(() => {
    process.env.THREADS_USER_ID = "threads-user";
    process.env[accessTokenEnv] = "dummy-value";
  });

  afterEach(() => {
    if (originalUserId === undefined) delete process.env.THREADS_USER_ID;
    else process.env.THREADS_USER_ID = originalUserId;
    if (originalAccessToken === undefined) delete process.env[accessTokenEnv];
    else process.env[accessTokenEnv] = originalAccessToken;
    globalThis.fetch = originalFetch;
  });

  it("code 190 Failed to decrypt create 오류를 안정적인 invalid token reason으로 정규화한다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Error validating access token: Failed to decrypt",
            type: "OAuthException",
            code: 190,
          },
        }),
        { status: 400 },
      )) as typeof fetch;

    const result = await publishThreadsPost({ text: "정책 안내 테스트" });
    expect(result).toEqual({
      ok: false,
      reason: "create_invalid_token_code_190_failed_to_decrypt",
    });
  });

  it("publish 단계 OAuth 오류도 stage를 보존해 정규화한다", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ id: "creation-id" }), { status: 200 });
      return new Response(
        JSON.stringify({ error: { message: "OAuth failed", type: "OAuthException" } }),
        { status: 401 },
      );
    }) as typeof fetch;

    const result = await publishThreadsPost({ text: "정책 안내 테스트" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("publish_oauth_401");
  });
});
