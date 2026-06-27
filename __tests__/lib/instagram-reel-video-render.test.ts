import { access, stat } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { renderReelVideo } from "@/lib/instagram/reel-video-render";

describe("renderReelVideo", () => {
  it("renders a vertical mp4 file", async () => {
    const rendered = await renderReelVideo({
      slug: "test-reel",
      title: "청년 월세 지원 신청 안내",
      category: "청년",
      meta_description: "소득 조건을 충족한 청년에게 월세를 지원합니다.",
      content: "신청 기간과 제출 서류를 확인하세요. 대상과 금액은 지역별로 다를 수 있습니다.",
    });
    try {
      await access(rendered.filePath);
      const info = await stat(rendered.filePath);
      expect(info.size).toBeGreaterThan(10_000);
      expect(rendered.durationSeconds).toBe(15);
    } finally {
      await rendered.cleanup();
    }
  }, 30_000);

  it("does not use slug text as the temporary output path", async () => {
    const rendered = await renderReelVideo({
      slug: "../unsafe/nested-slug",
      title: "청년 월세 지원 신청 안내",
      category: "청년",
      meta_description: "소득 조건을 충족한 청년에게 월세를 지원합니다.",
      content: "신청 기간과 제출 서류를 확인하세요. 대상과 금액은 지역별로 다를 수 있습니다.",
    });
    try {
      await access(rendered.filePath);
      expect(basename(rendered.filePath)).toBe("reel.mp4");
    } finally {
      await rendered.cleanup();
    }
  }, 30_000);
});
