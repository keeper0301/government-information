import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HomeCTA } from "@/components/home-cta";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string | { toString(): string }; children: ReactNode }) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/adsense-review-mode", () => ({
  ADSENSE_REVIEW_MODE: true,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("HomeCTA AdSense review mode", () => {
  it("routes away from pricing while preserving approval-time restore in component code", () => {
    act(() => {
      root.render(<HomeCTA />);
    });

    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/guides", "/c/business"]);
    expect(container.textContent).toContain("대표 가이드부터 확인하기");
    expect(container.innerHTML).not.toContain("/pricing");
  });
});
