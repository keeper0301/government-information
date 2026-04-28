import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { submitToIndexNow } from "@/lib/indexnow";

// ============================================================
// submitToIndexNow — 네이버 IndexNow + indexnow.org ping
// ============================================================
describe("submitToIndexNow", () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.INDEXNOW_KEY = "test_key_64_chars_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.keepioo.com";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INDEXNOW_KEY;
    else process.env.INDEXNOW_KEY = originalKey;
    if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
    globalThis.fetch = originalFetch;
  });

  // 간단 mock 헬퍼 — fetch 응답 시퀀스 지정
  function mockFetch(...responses: (Response | Error)[]) {
    let i = 0;
    const calls: Array<[string, RequestInit | undefined]> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push([url, init]);
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      if (r instanceof Error) throw r;
      return r;
    }) as typeof fetch;
    return calls;
  }

  it("INDEXNOW_KEY 미설정 시 skip", async () => {
    delete process.env.INDEXNOW_KEY;
    const r = await submitToIndexNow(["https://www.keepioo.com/blog/test"]);
    expect(r).toEqual([{ ok: false, reason: "skipped_no_key" }]);
  });

  it("urls 빈 배열 → submitted 0", async () => {
    const r = await submitToIndexNow([]);
    expect(r[0]).toMatchObject({ ok: true, submitted: 0 });
  });

  it("invalid URL → network_error", async () => {
    const r = await submitToIndexNow(["not-a-url"]);
    expect(r[0]).toMatchObject({ ok: false, reason: "network_error" });
  });

  it("정상 응답 200 → ok true", async () => {
    const calls = mockFetch(
      new Response("OK", { status: 200 }),
      new Response("OK", { status: 200 }),
    );

    const urls = ["https://www.keepioo.com/blog/test1", "https://www.keepioo.com/blog/test2"];
    const r = await submitToIndexNow(urls);

    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("https://searchadvisor.naver.com/indexnow");
    expect(calls[1][0]).toBe("https://api.indexnow.org/indexnow");

    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ok: true, submitted: 2, provider: "naver" });
    expect(r[1]).toMatchObject({ ok: true, submitted: 2, provider: "indexnow.org" });
  });

  it("payload host + key + urlList 정확히 전송", async () => {
    const calls = mockFetch(
      new Response("OK", { status: 200 }),
      new Response("OK", { status: 200 }),
    );

    await submitToIndexNow(["https://www.keepioo.com/blog/test"]);

    const body = JSON.parse(calls[0][1]!.body as string);
    expect(body.host).toBe("www.keepioo.com");
    expect(body.key).toBe(process.env.INDEXNOW_KEY);
    expect(body.keyLocation).toBe("https://www.keepioo.com/api/indexnow-key");
    expect(body.urlList).toEqual(["https://www.keepioo.com/blog/test"]);
  });

  it("10,000 초과 URL 은 자동 슬라이스", async () => {
    const calls = mockFetch(
      new Response("OK", { status: 200 }),
      new Response("OK", { status: 200 }),
    );

    const urls = Array.from(
      { length: 15_000 },
      (_, i) => `https://www.keepioo.com/blog/${i}`,
    );
    await submitToIndexNow(urls);

    const body = JSON.parse(calls[0][1]!.body as string);
    expect(body.urlList).toHaveLength(10_000);
  });

  it("네이버 4xx → http_error 이지만 indexnow.org 는 진행", async () => {
    mockFetch(
      new Response("Forbidden", { status: 403 }),
      new Response("OK", { status: 200 }),
    );

    const r = await submitToIndexNow(["https://www.keepioo.com/blog/test"]);
    expect(r[0]).toMatchObject({ ok: false, reason: "http_error", status: 403 });
    expect(r[1]).toMatchObject({ ok: true, provider: "indexnow.org" });
  });

  it("네트워크 오류 → network_error (둘 다 실패해도 throw 안 함)", async () => {
    mockFetch(new Error("ECONNREFUSED"), new Error("ECONNREFUSED"));

    const r = await submitToIndexNow(["https://www.keepioo.com/blog/test"]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ok: false, reason: "network_error" });
    expect(r[1]).toMatchObject({ ok: false, reason: "network_error" });
  });

  it("202 Accepted 도 성공으로 처리 (IndexNow 표준)", async () => {
    mockFetch(
      new Response(null, { status: 202 }),
      new Response(null, { status: 202 }),
    );

    const r = await submitToIndexNow(["https://www.keepioo.com/blog/test"]);
    expect(r[0]).toMatchObject({ ok: true, provider: "naver" });
  });
});
