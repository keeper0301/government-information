import { describe, expect, it } from "vitest";
import { isOwnComment } from "@/lib/instagram/collect-comments";

describe("isOwnComment", () => {
  it("본인 계정 댓글이면 true (대소문자 무시)", () => {
    expect(isOwnComment("keepioo_official", "keepioo_official")).toBe(true);
    expect(isOwnComment("Keepioo_Official", "keepioo_official")).toBe(true);
  });

  it("다른 사용자 댓글이면 false", () => {
    expect(isOwnComment("some_user", "keepioo_official")).toBe(false);
  });

  it("username 또는 ownUsername 미상이면 false (일반 댓글로 취급)", () => {
    expect(isOwnComment(null, "keepioo_official")).toBe(false);
    expect(isOwnComment("some_user", null)).toBe(false);
    expect(isOwnComment(null, null)).toBe(false);
  });
});
