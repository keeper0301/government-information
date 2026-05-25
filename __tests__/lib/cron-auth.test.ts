import { afterEach, describe, expect, it } from "vitest";
import { authorizeCronRequest, authorizeOptionalCronRequest } from "@/lib/cron-auth";

const OLD_CRON_SECRET = process.env.CRON_SECRET;

function requestWithToken(token?: string) {
  return new Request("https://www.keepioo.com/api/cron/test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function readError(response: Response) {
  return (await response.json()) as { error: string };
}

function restoreCronSecret() {
  if (OLD_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
    return;
  }

  process.env.CRON_SECRET = OLD_CRON_SECRET;
}

describe("authorizeCronRequest", () => {
  afterEach(() => {
    restoreCronSecret();
  });

  it("CRON_SECRET 비밀값이 없으면 한국어 오류를 반환한다", async () => {
    delete process.env.CRON_SECRET;

    const response = authorizeCronRequest(requestWithToken("secret"));

    expect(response?.status).toBe(500);
    await expect(readError(response!)).resolves.toEqual({
      error: "CRON_SECRET 비밀값이 설정되지 않았습니다.",
    });
  });

  it("인증값이 다르면 한국어 오류를 반환한다", async () => {
    process.env.CRON_SECRET = "right-secret";

    const response = authorizeCronRequest(requestWithToken("wrong-secret"));

    expect(response?.status).toBe(401);
    await expect(readError(response!)).resolves.toEqual({
      error: "인증에 실패했습니다.",
    });
  });

  it("인증값이 맞으면 null을 반환한다", () => {
    process.env.CRON_SECRET = "right-secret";

    const response = authorizeCronRequest(requestWithToken("right-secret"));

    expect(response).toBeNull();
  });
});

describe("authorizeOptionalCronRequest", () => {
  afterEach(() => {
    restoreCronSecret();
  });

  it("CRON_SECRET 비밀값이 없으면 통과시킨다", () => {
    delete process.env.CRON_SECRET;

    const response = authorizeOptionalCronRequest(requestWithToken("anything"));

    expect(response).toBeNull();
  });

  it("CRON_SECRET 비밀값이 있을 때 인증값이 다르면 인증 실패를 반환한다", async () => {
    process.env.CRON_SECRET = "right-secret";

    const response = authorizeOptionalCronRequest(requestWithToken("wrong-secret"));

    expect(response?.status).toBe(401);
    await expect(readError(response!)).resolves.toEqual({
      error: "인증에 실패했습니다.",
    });
  });

  it("CRON_SECRET 비밀값이 있을 때 인증값이 맞으면 통과시킨다", () => {
    process.env.CRON_SECRET = "right-secret";

    const response = authorizeOptionalCronRequest(requestWithToken("right-secret"));

    expect(response).toBeNull();
  });
});
