"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#F7F8FA",
            color: "#191F28",
            fontFamily:
              "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: 420,
              border: "1px solid #E5E8EB",
              borderRadius: 16,
              background: "#FFFFFF",
              padding: 24,
              textAlign: "center",
            }}
          >
            <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>
              페이지를 불러오지 못했습니다
            </h1>
            <p style={{ margin: "0 0 20px", color: "#6B7684", lineHeight: 1.6 }}>
              일시적인 오류일 수 있습니다. 다시 시도해도 문제가 반복되면 잠시 후
              접속해 주세요.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                border: 0,
                borderRadius: 10,
                background: "#3182F6",
                color: "#FFFFFF",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                padding: "12px 16px",
              }}
            >
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
