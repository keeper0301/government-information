// 정부 공개 사이트 접속 오류의 내부 원인을 관리자 기록에 남깁니다.
export function describeScrapeError(error: unknown): string {
  const messages: string[] = [];
  function collect(value: unknown, depth: number) {
    if (depth > 3 || !value || typeof value !== "object") return;
    const detail = value as { message?: string; code?: string; cause?: unknown; errors?: unknown[] };
    const message = [detail.code, detail.message].filter(Boolean).join(": ");
    if (message && !messages.includes(message)) messages.push(message);
    collect(detail.cause, depth + 1);
    detail.errors?.slice(0, 3).forEach(item => collect(item, depth + 1));
  }
  collect(error, 0);
  return (messages.join(" → ") || String(error)).slice(0, 600);
}
