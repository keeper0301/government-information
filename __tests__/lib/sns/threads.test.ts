import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishThreadsPost } from "@/lib/sns/threads";

const accessTokenEnv = "THREADS_ACCESS_" + "TOKEN";
const originalUserId = process.env.THREADS_USER_ID;
const originalAccessToken = process.env[accessTokenEnv];
const originalFetch = globalThis.fetch;
const validText = [
  "기초연금은 매달 25일에 끝나는 돈이 아닙니다.",
  "",
  "한 어르신에게는 생활비이고, 동네 가게에는 매출이 됩니다.",
  "현장에서는 지역 안에서 다시 도는 소비로 이어집니다.",
  "정책 효과를 볼 때는 수급자 한 명만 보지 말고 주변 상권과 일자리까지 같이 봐야 합니다.",
  "",
  "자세히 보기",
  "https://www.keepioo.com/blog/test",
].join("\n");

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

    const result = await publishThreadsPost({ text: validText });
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

    const result = await publishThreadsPost({ text: validText });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("publish_oauth_401");
  });

  it("publish 응답에 id가 없으면 실패 처리한다", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ id: "creation-id" }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    await expect(publishThreadsPost({ text: validText })).resolves.toEqual({
      ok: false,
      reason: "no_publish_id",
    });
  });

  it("제목+링크뿐인 얇은 게시물은 발행 전에 차단한다", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishThreadsPost({ text: "제목만 있는 글\n\nhttps://www.keepioo.com/blog/test" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("본문 정보량 부족");
  });
});
