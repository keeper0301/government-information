import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cached = { status: 200, marker: "저장된 파일" };
  const fetch = vi.fn(async () => new Response("새 응답"));
  const cache = { match: vi.fn(async () => cached), put: vi.fn(), addAll: vi.fn() };
  const open = vi.fn(async () => cache);
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { origin: "https://www.keepioo.com" },
      addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } },
    caches: { match: cache.match, open },
    fetch, URL, Promise, console, Response,
  });
  return { listeners, cached, fetch, cache, open };
}

describe("방문 파일 저장 전략", () => {
  it.each(["열기", "읽기"])("저장소 %s가 실패해도 고정 파일을 통신으로 받는다", async operation => {
    const context = worker();
    if (operation === "열기") context.open.mockRejectedValueOnce(new Error("저장소 접근 불가"));
    else context.cache.match.mockRejectedValueOnce(new Error("저장 파일 읽기 실패"));
    const response = new Response("통신으로 받은 파일");
    context.fetch.mockResolvedValueOnce(response);
    let result: unknown;
    context.listeners.fetch({ request: { method: "GET", url: "https://www.keepioo.com/_next/static/chunks/a.js", headers: new Headers() },
      respondWith: (promise: Promise<unknown>) => { result = promise; } });
    expect(await result).toBe(response);
  });
  it("저장 공간이 부족해도 정상적으로 받은 고정 파일은 반환한다", async () => {
    const context = worker();
    context.cache.match.mockResolvedValueOnce(undefined as never);
    context.cache.put.mockRejectedValueOnce(new Error("저장 공간 부족"));
    const response = { status: 200, type: "basic", headers: new Headers(), clone: () => new Response("파일") } as Response;
    context.fetch.mockResolvedValueOnce(response);
    let result: unknown;
    context.listeners.fetch({ request: { method: "GET", url: "https://www.keepioo.com/_next/static/chunks/new.js", headers: new Headers() },
      respondWith: (promise: Promise<unknown>) => { result = promise; } });
    expect(await result).toBe(response);
  });
  it("화면 요청의 통신이 끊기면 오프라인 안내를 표시한다", async () => {
    const context = worker();
    context.fetch.mockRejectedValueOnce(new Error("통신 끊김"));
    let result: unknown;
    context.listeners.fetch({ request: { method: "GET", mode: "navigate", url: "https://www.keepioo.com/welfare", headers: new Headers() },
      respondWith: (promise: Promise<unknown>) => { result = promise; } });
    expect(await result).toBe(context.cached);
    expect(context.cache.match).toHaveBeenCalledWith("/offline");
  });
  it("버전이 붙은 고정 파일은 저장된 응답만 사용한다", async () => {
    const context = worker();
    let result: unknown;
    context.listeners.fetch({ request: { method: "GET", url: "https://www.keepioo.com/_next/static/chunks/a.js", headers: new Headers() },
      respondWith: (promise: Promise<unknown>) => { result = promise; }, waitUntil: vi.fn() });
    expect(await result).toBe(context.cached);
    expect(context.fetch).not.toHaveBeenCalled();
  });

  it.each(["/?_rsc=123", "/welfare", "/news", "/mypage", "/api/public"])(
    "%s 요청은 공통 저장 응답으로 바꾸지 않는다", (path) => {
      const context = worker();
      const respondWith = vi.fn();
      context.listeners.fetch({ request: { method: "GET", url: `https://www.keepioo.com${path}`, headers: new Headers() }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    });
});
