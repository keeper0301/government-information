import { afterEach, describe, expect, it } from "vitest";
import { authorizeNaverExtensionRequest } from "@/lib/naver-extension-auth";

const OLD_NAVER_EXTENSION_SECRET = process.env.NAVER_EXTENSION_SECRET;

function requestWithToken(token?: string) {
  return new Request("https://www.keepioo.com/api/naver-extension/next", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function readError(response: Response) {
  return (await response.json()) as { error: string };
}

function restoreNaverExtensionSecret() {
  if (OLD_NAVER_EXTENSION_SECRET === undefined) {
    delete process.env.NAVER_EXTENSION_SECRET;
    return;
  }

  process.env.NAVER_EXTENSION_SECRET = OLD_NAVER_EXTENSION_SECRET;
}

describe("authorizeNaverExtensionRequest", () => {
  afterEach(() => {
    restoreNaverExtensionSecret();
  });

  it("네이버 확장 비밀값이 없으면 서버 오류를 반환한다", async () => {
    delete process.env.NAVER_EXTENSION_SECRET;

    const response = authorizeNaverExtensionRequest(requestWithToken("secret"));

    expect(response?.status).toBe(500);
    await expect(readError(response!)).resolves.toEqual({
      error: "NAVER_EXTENSION_SECRET 비밀값이 설정되지 않았습니다.",
    });
  });

  it("인증값이 다르면 인증 실패를 반환한다", async () => {
    process.env.NAVER_EXTENSION_SECRET = "right-secret";

    const response = authorizeNaverExtensionRequest(requestWithToken("wrong-secret"));

    expect(response?.status).toBe(401);
    await expect(readError(response!)).resolves.toEqual({
      error: "인증에 실패했습니다.",
    });
  });

  it("인증값이 맞으면 null을 반환한다", () => {
    process.env.NAVER_EXTENSION_SECRET = "right-secret";

    const response = authorizeNaverExtensionRequest(requestWithToken("right-secret"));

    expect(response).toBeNull();
  });
});
