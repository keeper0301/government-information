import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PostCheckoutActivationChecklist } from "@/app/checkout/activation/post-checkout-activation-checklist";
import { getPostCheckoutActivationCopy } from "@/lib/checkout/post-checkout-copy";
import { EVENTS, trackEvent } from "@/lib/analytics";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string | { toString(): string }; children: ReactNode }) => (
    <a
      href={typeof href === "string" ? href : String(href)}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/analytics", () => ({
  EVENTS: {
    POST_CHECKOUT_ACTIVATION_CLICKED: "post_checkout_activation_clicked",
  },
  trackEvent: vi.fn(),
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
  vi.clearAllMocks();
});

function renderChecklist(tier: "basic" | "pro") {
  act(() => {
    root.render(
      <PostCheckoutActivationChecklist
        tier={tier}
        copy={getPostCheckoutActivationCopy(tier)}
      />,
    );
  });
}

describe("PostCheckoutActivationChecklist", () => {
  it("keeps Basic checkout activation focused on business profile and alert condition CTAs", () => {
    renderChecklist("basic");

    const links = Array.from(container.querySelectorAll("a"));
    expect(container.textContent).toContain("사업자 프로필 입력하기");
    expect(container.textContent).toContain("감시 조건 1개 저장하기");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/mypage/business?from=checkout-activation",
      "/mypage/notifications?from=checkout-activation",
    ]);
  });

  it("keeps Pro checkout activation focused on Kakao consent and alert condition CTAs", () => {
    renderChecklist("pro");

    const links = Array.from(container.querySelectorAll("a"));
    expect(container.textContent).toContain("카카오 알림톡 동의 켜기");
    expect(container.textContent).toContain("감시 조건 1개 저장하기");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/mypage?from=checkout-activation#consents",
      "/mypage/notifications?from=checkout-activation",
    ]);
  });

  it("tracks the exact tier, action, and checklist step on CTA click", () => {
    renderChecklist("pro");

    const [kakaoLink, notificationsLink] = Array.from(container.querySelectorAll("a"));
    act(() => {
      kakaoLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      notificationsLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(trackEvent).toHaveBeenNthCalledWith(1, EVENTS.POST_CHECKOUT_ACTIVATION_CLICKED, {
      tier: "pro",
      action: "kakao_consent",
      step: 1,
    });
    expect(trackEvent).toHaveBeenNthCalledWith(2, EVENTS.POST_CHECKOUT_ACTIVATION_CLICKED, {
      tier: "pro",
      action: "notifications",
      step: 2,
    });
  });
});
