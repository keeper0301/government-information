// PWARegister 가벼운 import smoke 테스트.
//
// 왜 import 만 검사?
//  · service worker 등록 자체는 jsdom 환경에서 mock 이 까다로움
//    (navigator.serviceWorker, window.location.hostname 등 복합 조합)
//  · 핵심 회귀 위험은 "module 자체가 깨져 빌드 실패"
//  · 그 한 가지 가드만 잡으면 ROI 상 충분 (1 test, 빠름, 신뢰)

import { describe, expect, it } from "vitest";

describe("PWARegister", () => {
  it("module import 성공 + 컴포넌트 export", async () => {
    const mod = await import("@/components/pwa-register");
    expect(mod.PWARegister).toBeDefined();
    expect(typeof mod.PWARegister).toBe("function");
  });
});
