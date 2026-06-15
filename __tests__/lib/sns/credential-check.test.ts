import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSnsCredentials, checkThreadsCredentials } from "@/lib/sns/credential-check";

const envKeys = [
  "TWITTER_API_KEY",
  "TWITTER_API_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_TOKEN_SECRET",
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "THREADS_USER_ID",
  "THREADS_ACCESS_TOKEN",
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restoreEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("sns credential checks", () => {
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("credentials가 없으면 provider 호출 없이 missing으로 표시한다", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkSnsCredentials();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "twitter", checked: false, reason: "missing_credentials" }),
        expect.objectContaining({ channel: "facebook", checked: false, reason: "missing_credentials" }),
        expect.objectContaining({ channel: "threads", checked: false, reason: "missing_credentials" }),
      ]),
    );
  });

  it("Threads code 190 Failed to decrypt를 invalid token reason으로 정규화한다", async () => {
    process.env.THREADS_USER_ID = "threads-user";
    process.env.THREADS_ACCESS_TOKEN = "dummy";
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

    const result = await checkThreadsCredentials();

    expect(result).toMatchObject({
      channel: "threads",
      ready: true,
      checked: true,
      ok: false,
      httpStatus: 400,
      reason: "invalid_token_code_190_failed_to_decrypt",
    });
  });
});
