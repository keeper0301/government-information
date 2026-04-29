// 어드민 모바일 사이드바 (햄버거 + slide-in drawer) 동작 검증
// jsdom 환경에서 createRoot 로 직접 렌더 — testing-library 미사용
//
// 검증 케이스 (사장님 요청 #1 모바일 어드민 검증):
//  1. 초기 상태 — drawer aria-hidden=true, -translate-x-full
//  2. 햄버거 클릭 → 열림 (aria-hidden=false, translate-x-0)
//  3. 닫기 버튼 클릭 → 닫힘
//  4. dim 오버레이 클릭 → 닫힘
//  5. ESC 키 → 닫힘
//  6. body scroll lock 토글 (열림 시 overflow=hidden)
//  7. focus 이동 — 열림 시 닫기 버튼, 닫힘 시 햄버거 복귀

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// next/navigation 가 jsdom 에서 router context 를 못 찾아 throw — Sidebar 자체를 stub 처리
// (이 테스트의 관심사는 sidebar-mobile-toggle 의 drawer 동작)
vi.mock("@/components/admin/sidebar", () => ({
  Sidebar: ({ onItemClick }: { onItemClick?: () => void }) => (
    // 메뉴 항목 1개만 stub — onItemClick 동작 + Tab focus trap 의 last focusable 로 활용
    <a
      href="/admin/health"
      onClick={(e) => {
        e.preventDefault();
        onItemClick?.();
      }}
      data-testid="stub-menu-item"
    >
      stub-menu
    </a>
  ),
}));

// mock 이후에 import — 실제 호출 시 위 mock 이 반환됨
import { SidebarMobileToggle } from "@/components/admin/sidebar-mobile-toggle";

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
  document.body.style.overflow = ""; // 다음 케이스로 누수 방지
});

// 헬퍼 — 셀렉터 모음
const getDrawer = () =>
  container.querySelector("#admin-mobile-drawer") as HTMLElement;
const getHamburger = () =>
  container.querySelector(
    'button[aria-label="메뉴 열기"]',
  ) as HTMLButtonElement;
const getCloseBtn = () =>
  container.querySelector(
    'button[aria-label="메뉴 닫기"]',
  ) as HTMLButtonElement;
const getDim = () =>
  container.querySelector(
    'div[aria-hidden][class*="bg-black"]',
  ) as HTMLDivElement | null;

describe("SidebarMobileToggle", () => {
  it("초기 상태 — drawer 닫힘 (aria-hidden=true, -translate-x-full)", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    const drawer = getDrawer();
    expect(drawer).toBeTruthy();
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(drawer.className).toContain("-translate-x-full");
    // dim 오버레이는 닫힘 상태에서 미렌더
    expect(getDim()).toBeNull();
    // 햄버거 aria-expanded=false
    expect(getHamburger().getAttribute("aria-expanded")).toBe("false");
  });

  it("햄버거 클릭 → drawer 열림 (aria-hidden=false, translate-x-0)", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    act(() => {
      getHamburger().click();
    });
    const drawer = getDrawer();
    expect(drawer.getAttribute("aria-hidden")).toBe("false");
    expect(drawer.className).toContain("translate-x-0");
    expect(drawer.className).not.toContain("-translate-x-full");
    // dim 오버레이 표시
    expect(getDim()).toBeTruthy();
    // 햄버거 aria-expanded=true
    expect(getHamburger().getAttribute("aria-expanded")).toBe("true");
  });

  it("닫기 버튼 (×) 클릭 → drawer 닫힘", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    act(() => {
      getHamburger().click();
    });
    act(() => {
      getCloseBtn().click();
    });
    const drawer = getDrawer();
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(drawer.className).toContain("-translate-x-full");
  });

  it("dim 오버레이 클릭 → drawer 닫힘", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    act(() => {
      getHamburger().click();
    });
    const dim = getDim();
    expect(dim).toBeTruthy();
    act(() => {
      dim!.click();
    });
    expect(getDrawer().getAttribute("aria-hidden")).toBe("true");
  });

  it("ESC 키 → drawer 닫힘", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    act(() => {
      getHamburger().click();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(getDrawer().getAttribute("aria-hidden")).toBe("true");
  });

  it("메뉴 항목 클릭 → drawer 자동 닫힘 (onItemClick)", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    act(() => {
      getHamburger().click();
    });
    expect(getDrawer().getAttribute("aria-hidden")).toBe("false");
    const menuItem = container.querySelector(
      '[data-testid="stub-menu-item"]',
    ) as HTMLAnchorElement;
    expect(menuItem).toBeTruthy();
    act(() => {
      menuItem.click();
    });
    expect(getDrawer().getAttribute("aria-hidden")).toBe("true");
  });

  it("body scroll lock — 열림 시 overflow=hidden, 닫힘 시 복원", () => {
    document.body.style.overflow = "auto";
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    expect(document.body.style.overflow).toBe("auto");
    act(() => {
      getHamburger().click();
    });
    expect(document.body.style.overflow).toBe("hidden");
    act(() => {
      getCloseBtn().click();
    });
    expect(document.body.style.overflow).toBe("auto");
  });

  it("focus 이동 — 열림 시 닫기 버튼, 닫힘 시 햄버거 복귀", () => {
    act(() => {
      root.render(<SidebarMobileToggle />);
    });
    // 열림 → 닫기 버튼 focus
    act(() => {
      getHamburger().click();
    });
    expect(document.activeElement).toBe(getCloseBtn());
    // 닫힘 → 햄버거 focus 복귀
    act(() => {
      getCloseBtn().click();
    });
    expect(document.activeElement).toBe(getHamburger());
  });
});
