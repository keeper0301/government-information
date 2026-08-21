import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HomeCTA } from "@/components/home-cta";
import { PopularPicksAside } from "@/components/popular-picks-aside";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/analytics", () => ({
  EVENTS: {
    HOME_POPULAR_DISMISSED: "home_popular_dismissed",
    HOME_POPULAR_CLICKED: "home_popular_clicked",
    HOME_POPULAR_SIGNUP_CTA: "home_popular_signup_cta",
  },
  trackEvent: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SaaS Basic CTA surfaces", () => {
  it("routes the homepage final CTA to Basic pricing", () => {
    act(() => {
      root.render(<HomeCTA />);
    });

    const link = Array.from(container.querySelectorAll("a")).find((el) =>
      el.textContent?.includes("내 정책 마감 알림 시작하기"),
    );
    expect(link?.getAttribute("href")).toBe("/pricing?from=home&recommended=basic");
  });

  it("routes the popular-picks anonymous CTA to Basic pricing", () => {
    act(() => {
      root.render(
        <PopularPicksAside
          isLoggedIn={false}
          picks={[
            {
              id: "p1",
              kind: "welfare",
              title: "소상공인 지원금",
              apply_end: null,
              view_count: 123,
            },
          ]}
        />,
      );
    });

    const link = Array.from(container.querySelectorAll("a")).find((el) =>
      el.textContent?.includes("내 정책 마감 알림 받기"),
    );
    expect(link?.getAttribute("href")).toBe("/pricing?from=popular&recommended=basic");
  });
});
