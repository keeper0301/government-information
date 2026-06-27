import { describe, expect, it } from "vitest";
import { buildReelVideoPlan, stripHtml } from "@/lib/instagram/reel-video-plan";

describe("reel-video-plan", () => {
  it("strips html and decodes common entities", () => {
    expect(stripHtml("<p>대상&nbsp;&amp;&nbsp;신청</p><script>x</script>")).toBe("대상 & 신청");
  });

  it("builds a 15 second five-slide plan from blog post text", () => {
    const plan = buildReelVideoPlan({
      slug: "slug-1",
      title: "2026년 청년 월세 지원 신청 방법과 대상 총정리",
      category: "청년",
      meta_description: "청년 월세 지원은 소득 조건을 충족한 청년에게 월세를 지원합니다.",
      content: "신청 기간은 2026년 7월까지이며 제출 서류와 소득 기준 확인이 필요합니다. 문의는 주민센터 또는 공식 누리집에서 가능합니다.",
    });

    expect(plan.durationSeconds).toBe(15);
    expect(plan.slides).toHaveLength(5);
    expect(plan.slides[0].eyebrow).toContain("청년");
    expect(plan.slides[0].title).toContain("2026년 청년 월세");
    expect(plan.slides.at(-1)?.eyebrow).toContain("자세히");
  });
});
