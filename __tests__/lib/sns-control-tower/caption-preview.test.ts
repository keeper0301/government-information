import { describe, expect, it } from "vitest";
import { buildSnsCaptionPreview } from "@/lib/sns-control-tower/caption-preview";

describe("SNS caption preview", () => {
  it("최신 블로그 행을 Threads 미리보기와 lead variant로 변환한다", () => {
    const preview = buildSnsCaptionPreview({
      slug: "2026년-안양시-장애인가정-출산장려금",
      title: "2026년 안양시 장애인가정 출산장려금 신청 안내",
      meta_description:
        "안양시 장애인가정 출산장려금의 대상과 신청 전 확인할 내용을 정리했습니다. 출산 시점과 거주 요건에 따라 지원 여부가 달라질 수 있습니다. 신청 전 준비 서류와 마감도 확인하세요.",
      published_at: "2026-06-20T00:00:00.000Z",
    });

    expect(preview.length).toBeLessThanOrEqual(500);
    expect(preview.leadVariant).toMatch(/^lead_[0-2]$/);
    expect(preview.text).toContain("\n\n원문\n");
    expect(preview.text).toContain("\n\n확인 포인트\n");
    expect(preview.text).toContain("utm_source=threads");
  });
});
