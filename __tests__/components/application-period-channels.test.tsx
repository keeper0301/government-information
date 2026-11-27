import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ not: () => ({ in: async () => ({ data: fixtures.rows }) }) }) }),
}) }));
vi.mock("@/lib/bookmarks", () => ({ getMyBookmarks: async () => [] }));

import ComparePage from "@/app/compare/page";
import { CompareForm } from "@/app/mypage/bookmarks/compare-form";
import { AlertList } from "@/app/alerts/alert-list";
import type { BookmarkItem } from "@/lib/bookmarks";

const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const bookmarks: BookmarkItem[] = ids.map((programId, i) => ({
  programId, programType: "welfare", bookmarkedAt: "2026-06-01", title: `정책 ${i + 1}`,
  category: "지원금", region: "전국", applyEnd: null,
}));

describe("채널별 신청기간 미확인 표시", () => {
  it.each(["welfare", "loan"])("%s 비교: 미확인과 실제 기간을 구분하고 선택 순서를 유지한다", async (type) => {
    fixtures.rows = ids.map((id, i) => ({
      id, title: `정책 ${i + 1}`, category: "지원금", source: "기관",
      apply_start: i ? "2026-06-01" : null, apply_end: i ? "2026-06-30" : null,
    })).reverse();
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ type, ids: ids.join(",") }) }));
    expect(html).toContain("신청기간 미확인");
    expect(html).not.toContain("상시");
    expect(html).toContain("2026-06-01 ~ 2026-06-30");
    expect(html.indexOf("정책 1")).toBeLessThan(html.indexOf("정책 2"));
    expect(html).toContain(`/${type}/${ids[0]}`);
  });

  it("북마크: 미확인 표시를 바꿔도 같은 종류 두 개 선택과 비교 링크를 유지한다", async () => {
    root = createRoot(container);
    await act(async () => root!.render(<CompareForm items={bookmarks} />));
    expect(container.textContent).toContain("신청기간 미확인");
    expect(container.textContent).not.toContain("상시");
    const checks = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => checks[0].click());
    await act(async () => checks[1].click());
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toContain(`/compare?type=welfare&ids=${ids.join(",")}`);
  });

  it("북마크: 날짜가 있는 항목의 D-day·마감 배지는 보존한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    const html = renderToStaticMarkup(<CompareForm items={bookmarks.map((item, i) => ({ ...item, applyEnd: i ? "2026-06-01" : "2026-06-30" }))} />);
    expect(html).toContain("D-15");
    expect(html).toContain("마감");
    expect(html).not.toContain("신청기간 미확인");
  });

  it("개인 알림: 미확인·실제 날짜를 표시하고 해제 요청을 보존한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({
      subscriptions: ids.map((id, i) => ({ id: `sub-${i}`, program_id: id, program_type: "welfare", is_active: true, notify_before_days: 3 })),
      programs: { [ids[0]]: { title: "날짜 없음", apply_end: null }, [ids[1]]: { title: "날짜 있음", apply_end: "2026-06-30" } },
    }) });
    vi.stubGlobal("fetch", fetchMock);
    root = createRoot(container);
    await act(async () => root!.render(<AlertList />));
    expect(container.textContent).toContain("신청기간 미확인");
    expect(container.textContent).not.toContain("상시");
    expect(container.textContent).toContain("2026-06-30");
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(fetchMock).toHaveBeenCalledWith("/api/alarm", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ subscriptionId: "sub-0" }) }));
    expect(container.textContent).toContain("해제된 알림 (1건)");
  });
});
