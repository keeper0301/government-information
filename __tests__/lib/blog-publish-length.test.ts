import { describe, it, expect } from "vitest";
import { MIN_CONTENT_LENGTH, MAX_CONTENT_LENGTH } from "@/lib/blog-publish";

describe("blog 본문 길이 임계치", () => {
  it("최소 2,000자 이상으로 상향됐다", () => {
    expect(MIN_CONTENT_LENGTH).toBeGreaterThanOrEqual(2000);
  });
  it("최대치는 목표 4,000자를 reject 하지 않는다", () => {
    expect(MAX_CONTENT_LENGTH).toBeGreaterThanOrEqual(4000);
  });
});
