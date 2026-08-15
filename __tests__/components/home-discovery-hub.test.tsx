import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeDiscoveryHub } from "@/components/home-discovery-hub";

describe("HomeDiscoveryHub", () => {
  it("renders the regional policy map slot in the homepage discovery HTML", () => {
    const html = renderToStaticMarkup(
      <HomeDiscoveryHub
        regionMap={(
          <section aria-label="지역별 진행 중 지원 공고">
            <h2>지역별 진행 중 지원 공고</h2>
            <div>전국 대상</div>
          </section>
        )}
      />,
    );

    expect(html).toContain("정책 탐색 허브");
    expect(html).toContain("맞춤 추천 다음은 직접 골라보세요");
    expect(html).toContain("내 상황에 맞는 정책 바로가기");
    expect(html).toContain("지역별 진행 중 지원 공고");
    expect(html).toContain("전국 대상");
  });
});
