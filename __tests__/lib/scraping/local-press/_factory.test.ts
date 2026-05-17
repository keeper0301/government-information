// ============================================================
// _factory.ts fetchPage 안전 가드 단위 테스트 (5/17)
// ============================================================
// 시청 사이트 redirect / alert page silent fail 방지 가드.
// 모든 시·군 collector 의 공통 fetch 경로 회귀 방지.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPage } from "@/lib/scraping/local-press/_factory";

describe("_factory fetchPage 안전 가드", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("정상 응답 (≥1KB, 한국어 본문) — 그대로 반환", async () => {
    const body = "<html>" + "가".repeat(2000) + "</html>";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    const result = await fetchPage("https://example.com/list");
    expect(result).toContain("가가가");
  });

  it("HTTP 500 → throw fetch failed", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("server error", { status: 500 }),
    );
    await expect(fetchPage("https://example.com/x")).rejects.toThrow(
      /fetch failed \(500\)/,
    );
  });

  it("작은 응답 (< 1KB, 196 byte redirect HTML) → throw response too small", async () => {
    // 포항 사례: mid 파라미터 누락 시 응답
    const body = `<!DOCTYPE html><html lang="ko"><head><title> 알림창 </title><script>alert('잘못된 접근입니다.'); location.href='/'</script></head><body></body></html>`;
    expect(body.length).toBeLessThan(1024);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    await expect(fetchPage("https://example.com/list")).rejects.toThrow(
      /response too small/,
    );
  });

  it("큰 응답 + alert('잘못된 접근') 포함 → throw alert/redirect", async () => {
    // 일부 사이트는 alert 도 큰 HTML 안에 묶어서 응답하는 경우.
    const body =
      "<html>" +
      "padding".repeat(300) +
      "<script>alert('잘못된 접근입니다.');</script>" +
      "padding".repeat(300) +
      "</html>";
    expect(body.length).toBeGreaterThan(1024);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    await expect(fetchPage("https://example.com/list")).rejects.toThrow(
      /alert\/redirect 응답 감지/,
    );
  });

  it("큰 응답 + alert('권한이 없') 포함 → throw", async () => {
    const body =
      "<html>" +
      "x".repeat(1100) +
      "<script>alert('권한이 없습니다.');</script>" +
      "</html>";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    await expect(fetchPage("https://example.com/x")).rejects.toThrow(
      /alert\/redirect 응답 감지/,
    );
  });

  it("일반 큰 HTML — alert keyword 없음 → 그대로 반환", async () => {
    // false positive 확인 — 보통 list page (alert script 없음) 통과
    const body =
      "<html><body>" +
      "<div>일반 보도자료 목록 페이지</div>".repeat(50) +
      "</body></html>";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    const result = await fetchPage("https://example.com/list");
    expect(result).toContain("일반 보도자료");
  });
});
