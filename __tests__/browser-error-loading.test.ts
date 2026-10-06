import { afterEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn(), captureRouterTransitionStart: vi.fn() }));
vi.mock("@sentry/nextjs", () => calls);
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
describe("오류 기록 도구 읽기", () => {
  it("첫 오류가 발생하면 도구를 준비하고 해당 오류를 전달한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://test@example.com/1");
    const { captureBrowserError } = await import("@/lib/browser-error-reporting");
    const error = new Error("첫 화면 오류");
    await captureBrowserError(error);
    expect(calls.init).toHaveBeenCalledTimes(1);
    expect(calls.captureException).toHaveBeenCalledWith(error);
  });
  it("동시에 준비해도 한 번만 초기화한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://test@example.com/1");
    const { loadBrowserErrorRecorder } = await import("@/lib/browser-error-reporting");
    await Promise.all([loadBrowserErrorRecorder(), loadBrowserErrorRecorder()]);
    expect(calls.init).toHaveBeenCalledTimes(1);
  });
  it("설정이 없으면 큰 오류 기록 도구를 초기화하지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await import("@/instrumentation-client");
    expect(calls.init).not.toHaveBeenCalled();
  });
});
