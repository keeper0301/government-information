import { describe, expect, it } from "vitest";
import { buildReelVideoPlan, stripHtml } from "@/lib/instagram/reel-video-plan";

describe("reel-video-plan", () => {
  it("strips html and decodes common entities", () => {
    expect(stripHtml("<p>대상&nbsp;&amp;&nbsp;신청</p><script>x</script>")).toBe("대상 & 신청");
  });

  it("builds a content-first five-slide plan from blog post text", () => {
    const plan = buildReelVideoPlan({
      slug: "slug-1",
      title: "2026년 가평군 신혼부부 주거자금 대출이자 지원: 최대 얼마까지 받을 수 있나요?",
      category: "주거",
      meta_description: "신혼부부의 주거비 부담을 덜어주기 위해 대출 이자를 지원하는 제도입니다.",
      content: `
| 지원 대상 | 가평군 거주 일정 요건을 갖춘 신혼부부 |
| 지원 혜택 | 주거자금 대출 이자 현금 지원 |
| 신청 방법 | 방문 신청 |
| 지원 지역 | 경기도 가평군 |

나이 · 지역 조건
가평군에 실제 거주하는 신혼부부를 대상으로 하며 혼인신고일로부터 7년 이내 기준을 적용할 수 있습니다.
소득 · 자격 조건
중위소득 180% 이내 등의 기준이 적용될 수 있고 무주택 요건도 중요한 심사 기준입니다.
신청 기간은 연중 상시 접수하거나 특정 기간에만 접수하는 경우가 있습니다.
`,
    });

    expect(plan.durationSeconds).toBe(18);
    expect(plan.slides).toHaveLength(5);
    expect(plan.slides[0].eyebrow).toContain("주거");
    expect(plan.slides[0].title).toContain("가평군");
    expect(plan.slides[0].title).toContain("신혼부부");
    expect(plan.slides[0].body).toContain("신청 전 3개만 보세요");
    expect(plan.slides[0].body).toContain("대상\n지원\n신청");
    expect(plan.slides[1]).toMatchObject({ title: "대상" });
    expect(plan.slides[1].body).toContain("조건");
    expect(plan.slides[1].body).toContain("가평군 거주 일정 요건을 갖춘 신혼부부");
    expect(plan.slides[1].body).toContain("혼인신고일로부터 7년 이내");
    expect(plan.slides[2]).toMatchObject({ title: "지원" });
    expect(plan.slides[2].body).toContain("혜택");
    expect(plan.slides[2].body).toContain("주거자금 대출 이자 현금 지원");
    expect(plan.slides[3]).toMatchObject({ title: "신청" });
    expect(plan.slides[3].body).toContain("방법");
    expect(plan.slides[3].body).toContain("방문 신청");
    expect(plan.slides.at(-1)?.title).toBe("신청 전 체크");
  });
});
