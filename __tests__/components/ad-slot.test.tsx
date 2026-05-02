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
  it("env 미설정 시 placeholder 노출 ('광고' 라벨)", () => {
    act(() => {
      root.render(<AdSlot />);
    });
    // placeholder 안에 '광고' 라벨이 있어야 함
    expect(container.textContent).toContain("광고");
    // 진짜 ins 태그는 env 미설정이라 렌더되면 안 됨
    expect(container.querySelector("ins.adsbygoogle")).toBeNull();
  });

  it("module import 성공 — AdSlot export 존재", async () => {
    const mod = await import("@/components/ad-slot");
    expect(mod.AdSlot).toBeDefined();
    expect(typeof mod.AdSlot).toBe("function");
  });

  it("format prop 받아도 placeholder 분기에서 에러 없음", () => {
    // env 미설정 환경이라 placeholder 만 렌더 — format 은 무시되지만 prop 전달 자체로 throw 없는지만 확인
    expect(() => {
      act(() => {
        root.render(<AdSlot format="auto" />);
      });
    }).not.toThrow();
    expect(container.textContent).toContain("광고");
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
