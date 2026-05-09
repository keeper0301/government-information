// ============================================================
// A3 — Sentry 일일 에러 요약 (24h issues + top N).
// ============================================================
// Sentry REST API: GET /api/0/projects/{org}/{project}/issues/?statsPeriod=24h
// Auth: Bearer SENTRY_AUTH_TOKEN. env 미설정 시 graceful skip (textForSummary=null).

const SENTRY_API_BASE = "https://sentry.io/api/0";

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  count: string; // 24h 발생 카운트
  level: string; // 'error' | 'warning' | 'info' | 'fatal'
  permalink: string;
  firstSeen: string;
  lastSeen: string;
  userCount: number;
}

export type SentrySummaryResult =
  | { ok: true; total: number; issues: SentryIssue[]; textForSummary: string }
  | { ok: false; reason: string };

export async function fetchSentryDailySummary(): Promise<SentrySummaryResult> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  const url = `${SENTRY_API_BASE}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?statsPeriod=24h&query=is%3Aunresolved&limit=10`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { ok: false, reason: `network: ${(e as Error).message.slice(0, 80)}` };
  }

  if (!res.ok) return { ok: false, reason: `http_${res.status}` };

  const data = (await res.json().catch(() => null)) as SentryIssue[] | null;
  if (!Array.isArray(data)) return { ok: false, reason: "invalid_response" };

  const issues = data.slice(0, 10);
  const total = issues.reduce((s, i) => s + (Number(i.count) || 0), 0);

  // 텔레그램 본문 — top 5 + 카운트 + level. 비어있으면 정상 메시지.
  let textForSummary: string;
  if (issues.length === 0) {
    textForSummary =
      "[keepioo Sentry 24h]\n\n✅ unresolved issues 없음 — 운영 안정";
  } else {
    const topLines = issues
      .slice(0, 5)
      .map(
        (i, idx) =>
          `${idx + 1}. [${i.level}] ${i.title.slice(0, 60)} — ${i.count}회 / ${i.userCount}명`,
      )
      .join("\n");
    textForSummary = [
      `[keepioo Sentry 24h]`,
      `unresolved ${issues.length}건 / 발생 합계 ${total}회`,
      "",
      topLines,
    ].join("\n");
  }

  return { ok: true, total, issues, textForSummary };
}
