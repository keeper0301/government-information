import { captureBrowserError, loadBrowserErrorRecorder } from "@/lib/browser-error-reporting";

// 첫 화면을 먼저 읽고, 여유 시간이 생기면 오류 기록 도구를 준비합니다.
// 준비 전에 생긴 오류는 직접 전달하므로 기록을 놓치지 않습니다.
if (process.env.NEXT_PUBLIC_SENTRY_DSN && typeof window !== "undefined") {
  const reportError = (event: ErrorEvent) => { void captureBrowserError(event.error ?? event.message); };
  const reportRejection = (event: PromiseRejectionEvent) => { void captureBrowserError(event.reason); };
  window.addEventListener("error", reportError);
  window.addEventListener("unhandledrejection", reportRejection);
  const prepare = () => {
    void loadBrowserErrorRecorder().then(recorder => {
      if (!recorder) return;
      window.removeEventListener("error", reportError);
      window.removeEventListener("unhandledrejection", reportRejection);
    });
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(prepare, { timeout: 1500 });
  else setTimeout(prepare, 1500);
}

export function onRouterTransitionStart(...arguments_: Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>) {
  void loadBrowserErrorRecorder().then(recorder => recorder?.captureRouterTransitionStart(...arguments_));
}
