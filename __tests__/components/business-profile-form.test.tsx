import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BusinessProfileForm } from "@/app/mypage/business/business-form";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function renderForm() {
  act(() => {
    root.render(
      <BusinessProfileForm
        userId="user-1"
        initial={{
          industry: null,
          revenue_scale: null,
          employee_count: null,
          business_type: null,
          established_date: null,
          region: null,
          district: null,
        }}
      />,
    );
  });
}

describe("BusinessProfileForm post-save activation", () => {
  it("connects saved Basic users to recommendation and alert setup", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tier: "basic", profile: { user_id: "user-1" } }),
    } as Response);

    renderForm();
    const button = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("저장하기"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(refreshMock).toHaveBeenCalled();
    expect(container.textContent).toContain("맞춤 정책 TOP 5 보기");
    expect(container.textContent).toContain("마감 알림 설정하기");
    expect(container.querySelector('a[href="/recommend?from=business-profile"]')).toBeTruthy();
    expect(container.querySelector('a[href="/alerts?from=business-profile"]')).toBeTruthy();
  });
});
