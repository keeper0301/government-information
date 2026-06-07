// ============================================================
// _factory.ts fetchPage 안전 가드 단위 테스트 (5/17)
// ============================================================
// 시청 사이트 redirect / alert page silent fail 방지 가드.
// 모든 시·군 collector 의 공통 fetch 경로 회귀 방지.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchPage,
  processProvidedHtml,
  type PressCollectorConfig,
} from "@/lib/scraping/local-press/_factory";

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

  it("중간 응답(1~4KB) + alert('잘못된 접근') 포함 → throw alert/redirect", async () => {
    // 실제 redirect/alert 페이지가 약간 큰 경우(1~4KB). alert 가드 size 창(<4096) 안.
    const body =
      "<html>" +
      "padding".repeat(200) +
      "<script>alert('잘못된 접근입니다.');</script>" +
      "padding".repeat(200) +
      "</html>";
    expect(body.length).toBeGreaterThan(1024);
    expect(body.length).toBeLessThan(4096);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    await expect(fetchPage("https://example.com/list")).rejects.toThrow(
      /alert\/redirect 응답 감지/,
    );
  });

  it("큰 정상 list(>4KB) + 인라인 조건부 alert → 통과 (평택 false positive 방지)", async () => {
    // 2026-06-07 평택 사례: 정상 list page(30KB+) 인라인 스크립트에 case '-2' 에러
    // 핸들러 alert("잘못된 접근입니다.") 가 있다. alert 가드는 작은 응답(<4096)에만
    // 적용하므로, 큰 정상 페이지는 인라인 alert 가 있어도 throw 하지 않고 통과해야 한다.
    const body =
      "<html><body>" +
      "<div>보도자료 목록 항목</div>".repeat(400) +
      "<script>switch(code){case '-2': alert('잘못된 접근입니다.'); break;}</script>" +
      "</body></html>";
    expect(body.length).toBeGreaterThan(4096);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(body, { status: 200 }),
    );
    const result = await fetchPage("https://example.com/list");
    expect(result).toContain("보도자료 목록 항목");
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

// ============================================================
// 본문 공통 엔티티 디코드 (2026-06-03) — collector 부분 치환 보완 회귀
// ============================================================
// daejeon 등 helper 비사용 collector 가 &middot;/&hellip; 를 안 풀고 raw 본문을
// 반환해도, factory 가 저장 직전 decodeHtmlEntities 로 일괄 디코드해야 함
// (body + summary 둘 다). DB 10개 collector 엔티티 잔존 사고 회귀 방어.
describe("_factory 본문 엔티티 디코드", () => {
  // insert payload 를 캡처하는 mock admin
  function makeAdmin(captured: { payload?: Record<string, unknown> }) {
    return {
      from: () => ({
        insert: (p: Record<string, unknown>) => {
          captured.payload = p;
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  function makeCfg(rawBody: string): PressCollectorConfig {
    return {
      cityName: "테스트시",
      region: "테스트",
      ministry: "테스트시청",
      sourceOutlet: "테스트시청",
      sourceCode: "local-press-test",
      listUrl: "https://example.com/list",
      parseListItems: () => [
        {
          seq: "1",
          title: "테스트 제목",
          publishedDate: "2026-06-03",
          sourceUrl: "https://example.com/1",
        },
      ],
      // collector 가 &middot;/&hellip; 를 안 푼 raw 본문 반환 (daejeon 패턴 재현)
      parseDetailBody: () => rawBody,
    };
  }

  it("raw 엔티티(&middot;·&hellip;)가 body 에서 디코드돼 저장됨", async () => {
    const rawBody = "노후&middot;파손 점검 " + "가".repeat(280) + " 무대&hellip;";
    const captured: { payload?: Record<string, unknown> } = {};
    await processProvidedHtml(
      makeCfg(rawBody),
      makeAdmin(captured) as never,
      "<list/>",
      { "1": "<detail/>" },
      10,
    );
    const body = captured.payload?.body as string;
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/&middot;|&hellip;/);
    expect(body).toContain("노후·파손");
    expect(body).toContain("무대…");
  });

  it("summary 도 디코드된 본문에서 생성됨 (raw 엔티티 누출 0)", async () => {
    const rawBody = "지원&middot;대상 안내 " + "나".repeat(280);
    const captured: { payload?: Record<string, unknown> } = {};
    await processProvidedHtml(
      makeCfg(rawBody),
      makeAdmin(captured) as never,
      "<list/>",
      { "1": "<detail/>" },
      10,
    );
    const summary = captured.payload?.summary as string;
    expect(summary).not.toMatch(/&middot;/);
    expect(summary).toContain("지원·대상");
  });

  it("제목 HTML 엔티티도 디코드 — 검색결과/OG/H1 노출 방지", async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    const cfg = makeCfg("본문 내용 " + "가".repeat(280));
    // 울산 패턴 재현 — 숫자 엔티티(&#039; &#034;)·&quot; raw 잔존
    cfg.parseListItems = () => [
      {
        seq: "1",
        title: "울산시, &#039;학교 감염병&#039; &quot;공모전&quot; 개최",
        publishedDate: "2026-06-03",
        sourceUrl: "https://example.com/1",
      },
    ];
    await processProvidedHtml(
      cfg,
      makeAdmin(captured) as never,
      "<list/>",
      { "1": "<detail/>" },
      10,
    );
    const title = captured.payload?.title as string;
    expect(title).not.toMatch(/&#0?39;|&#0?34;|&quot;/);
    expect(title).toContain("'학교 감염병'");
    expect(title).toContain('"공모전"');
  });

  it("이미 디코드된 본문은 그대로 (idempotent — 회귀 0)", async () => {
    const cleanBody = "이미 깨끗한 본문 · 점검 " + "다".repeat(280);
    const captured: { payload?: Record<string, unknown> } = {};
    await processProvidedHtml(
      makeCfg(cleanBody),
      makeAdmin(captured) as never,
      "<list/>",
      { "1": "<detail/>" },
      10,
    );
    expect(captured.payload?.body).toBe(cleanBody.slice(0, 20000));
  });
});
