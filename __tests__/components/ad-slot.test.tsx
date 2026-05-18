// AdSlot 단위 테스트
// - env 미설정 (테스트 환경 기본값) → placeholder 노출
// - module import 성공
//
// 참고: NEXT_PUBLIC_ADSENSE_CLIENT / NEXT_PUBLIC_ADSENSE_SLOT_INFEED 는
// 빌드 타임 inline 이라 vitest 환경에서 mock 어렵다. 테스트 환경에선 항상
// undefined → placeholder 분기만 검증한다 (공식 ins 슬롯은 e2e 단계 검증).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AdSlot, getAdRenderState } from "@/components/ad-slot";

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

describe("AdSlot", () => {
  it("env 미설정 시 노출 X (5/18 AdSense 재거절 후 placeholder 제거)", () => {
    act(() => {
      root.render(<AdSlot />);
    });
    // 검수 봇이 빈 "광고" 박스를 콘텐츠 없는 광고 슬롯으로 인식하지 않도록
    // null 반환 — DOM 에 아무것도 렌더링 안 함.
    expect(container.textContent).toBe("");
    expect(container.querySelector("ins.adsbygoogle")).toBeNull();
    expect(container.querySelector("div")).toBeNull();
  });

  it("module import 성공 — AdSlot export 존재", async () => {
    const mod = await import("@/components/ad-slot");
    expect(mod.AdSlot).toBeDefined();
    expect(typeof mod.AdSlot).toBe("function");
  });

  it("format prop 받아도 env 미설정 분기에서 에러 없음", () => {
    expect(() => {
      act(() => {
        root.render(<AdSlot format="auto" />);
      });
    }).not.toThrow();
    expect(container.textContent).toBe("");
  });
});

describe("getAdRenderState", () => {
  it("AdSense unfilled state collapses the slot", () => {
    const ins = document.createElement("ins");
    ins.setAttribute("data-ad-status", "unfilled");

    expect(getAdRenderState(ins)).toBe("empty");
  });

  it("AdSense filled state keeps the slot visible", () => {
    const filled = document.createElement("ins");
    filled.setAttribute("data-ad-status", "filled");

    const withFrame = document.createElement("ins");
    withFrame.appendChild(document.createElement("iframe"));

    expect(getAdRenderState(filled)).toBe("filled");
    expect(getAdRenderState(withFrame)).toBe("filled");
  });
});
