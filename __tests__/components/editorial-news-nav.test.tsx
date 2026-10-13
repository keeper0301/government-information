import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Nav } from "@/components/nav";

vi.mock("@/lib/adsense-review-mode", () => ({ ADSENSE_REVIEW_MODE: true }));
vi.mock("next/navigation", () => ({ usePathname: () => "/news" }));
vi.mock("@/components/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/lib/nav/nav-auth-state", () => ({ getNavAuthState: async () => ({ isAdmin: false, loggedIn: false, alarmCount: 0 }) }));
let root: Root | undefined;
let container: HTMLDivElement;
async function renderNav(hasPublishedNews: boolean) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<Nav hasPublishedNews={hasPublishedNews} />); });
}
function newsLinks() {
  return container.querySelectorAll('a[href="/news"]');
}
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });

describe("검수 뉴스 메뉴", () => {
  it("공개 뉴스가 없으면 메뉴에 나오지 않는다", async () => {
    await renderNav(false);
    expect(newsLinks()).toHaveLength(0);
  });
  it("공개 뉴스가 있으면 컴퓨터와 휴대전화 메뉴에서 연결한다", async () => {
    await renderNav(true);
    expect(newsLinks()).toHaveLength(1);
    await act(async () => (container.querySelector('button[aria-expanded]') as HTMLButtonElement).click());
    expect(newsLinks()).toHaveLength(2);
  });
});
