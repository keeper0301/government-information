// UpgradeCta 단위 테스트
// - 무료→베이직 문구가 실제 베이직 기능(이메일·자격진단)과 맞는지
// - 베이직→프로 문구가 실제 프로 기능(카카오·AI 초안)과 맞는지
// - pricing 유입 출처와 추천 티어 쿼리가 붙는지

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UpgradeCta } from "@/components/upgrade-cta";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
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

describe("UpgradeCta", () => {
  it("free 사용자는 베이직 기능인 자격 진단과 이메일 알림을 안내한다", () => {
    act(() => {
      root.render(<UpgradeCta currentTier="free" source="business" />);
    });

    expect(container.textContent).toContain("사장님 자격 자동 진단");
    expect(container.textContent).toContain("마감 7일 전 이메일 알림");
    expect(container.textContent).not.toContain("카톡 알림 받으려면");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/pricing?from=business&recommended=basic");
  });

  it("basic 사용자는 프로 기능인 카카오 알림톡과 AI 초안을 안내한다", () => {
    act(() => {
      root.render(<UpgradeCta currentTier="basic" source="notifications" />);
    });

    expect(container.textContent).toContain("카카오 알림톡");
    expect(container.textContent).toContain("AI 상담 무제한");
    expect(container.textContent).toContain("신청서 초안");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/pricing?from=notifications&recommended=pro");
  });
});
