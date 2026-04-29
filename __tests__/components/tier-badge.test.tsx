// TierBadge 단위 테스트
// - 한국어 라벨이 티어별로 정확히 노출되는지
// - pro 만 ✨ 이모지가 들어가는지
// - size="md" / "sm" 클래스가 분기되는지
//
// jsdom 환경에서 createRoot + act 로 직접 렌더 (testing-library 미사용 — 기존 컨벤션 준수)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TierBadge } from "@/components/tier-badge";

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

describe("TierBadge", () => {
  it("free 티어 — 한국어 라벨 '무료' 노출", () => {
    act(() => {
      root.render(<TierBadge tier="free" />);
    });
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span!.textContent).toContain("무료");
    // free 는 ✨ 이모지 없음
    expect(span!.textContent).not.toContain("✨");
  });

  it("basic 티어 — 한국어 라벨 '베이직' 노출", () => {
    act(() => {
      root.render(<TierBadge tier="basic" />);
    });
    const span = container.querySelector("span");
    expect(span!.textContent).toContain("베이직");
    expect(span!.textContent).not.toContain("✨");
  });

  it("pro 티어 — 한국어 라벨 '프로' + ✨ 이모지", () => {
    act(() => {
      root.render(<TierBadge tier="pro" />);
    });
    const span = container.querySelector("span");
    expect(span!.textContent).toContain("프로");
    expect(span!.textContent).toContain("✨");
  });

  it("size='md' 적용 — text-sm + 큰 패딩 클래스", () => {
    act(() => {
      root.render(<TierBadge tier="pro" size="md" />);
    });
    const span = container.querySelector("span");
    expect(span!.className).toContain("text-sm");
    expect(span!.className).toContain("px-3");
  });

  it("size 기본값 'sm' — text-xs + 작은 패딩 클래스", () => {
    act(() => {
      root.render(<TierBadge tier="basic" />);
    });
    const span = container.querySelector("span");
    expect(span!.className).toContain("text-xs");
    expect(span!.className).toContain("px-2");
  });

  it("티어별 색상 — free=grey, basic=blue, pro=amber", () => {
    // free → grey 계열
    act(() => {
      root.render(<TierBadge tier="free" />);
    });
    expect(container.querySelector("span")!.className).toContain("bg-grey-100");

    // basic → blue 계열
    act(() => {
      root.render(<TierBadge tier="basic" />);
    });
    expect(container.querySelector("span")!.className).toContain("bg-blue-50");

    // pro → amber 계열
    act(() => {
      root.render(<TierBadge tier="pro" />);
    });
    expect(container.querySelector("span")!.className).toContain("bg-amber-50");
  });
});
