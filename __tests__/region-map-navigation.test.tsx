import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegionMap } from "@/components/region-map";

vi.mock("@/lib/home-stats", () => ({
  getWelfareRegionCounts: async () => ({ 서울: 887, 전북: 1024, 경남: 1180, 부산: 784, 제주: 369, 전국: 2347 }),
}));

describe("지도에서 지역 정책 목록 열기", () => {
  it("심사 모드에서도 모든 지역과 전국 버튼이 지역 필터를 전달한다", async () => {
    const document = new DOMParser().parseFromString(renderToStaticMarkup(await RegionMap()), "text/html");
    const links = Array.from(document.querySelectorAll('a[aria-label$="정책정보 보기"]'));
    expect(links).toHaveLength(17);
    for (const link of links) {
      const region = link.getAttribute("aria-label")!.replace(" 정책정보 보기", "");
      const destination = new URL(link.getAttribute("href")!, "https://www.keepioo.com");
      expect(destination.pathname).toBe("/welfare");
      expect(destination.searchParams.get("region")).toBe(region);
    }
  });
});
