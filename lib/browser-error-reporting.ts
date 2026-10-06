type ErrorRecorder = typeof import("@sentry/nextjs");
let recorderPromise: Promise<ErrorRecorder | null> | undefined;

/** 오류 도구는 나중에 읽되 실제 오류가 발생하면 즉시 읽고 전달합니다. */
export function loadBrowserErrorRecorder(): Promise<ErrorRecorder | null> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return Promise.resolve(null);
  recorderPromise ??= import("@sentry/nextjs").then(recorder => {
    recorder.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });
    return recorder;
  }).catch(() => {
    recorderPromise = undefined;
    console.warn("오류 기록 도구를 읽지 못했습니다.");
    return null;
  });
  return recorderPromise;
}

export async function captureBrowserError(error: unknown) {
  const recorder = await loadBrowserErrorRecorder();
  recorder?.captureException(error);
}
