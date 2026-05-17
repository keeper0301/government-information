// ============================================================
// 외부 채널 학습 힌트
// ============================================================
// 인스타그램/네이버 발행 성공·실패 신호를 다음 글 생성 프롬프트에 되먹인다.
// 인증·캡차 같은 운영 오류를 콘텐츠 문제로 오해하지 않도록, 힌트는
// "짧은 CTA, 붙여넣기 안정성, 공식 경로 명확화" 수준으로 제한한다.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type InstagramActionRow = {
  action: string | null;
  details?: unknown;
};

export type NaverAuditRow = {
  result: string | null;
  error_message?: string | null;
  skip_reason?: string | null;
};

export type ExternalChannelLearningInput = {
  instagramActions?: InstagramActionRow[];
  naverAudits?: NaverAuditRow[];
};

// 비용 절약 (5/17): 5 → 3. 입력 토큰 ↓
const DEFAULT_LIMIT = 3;
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, 80);
}

function topReasons(reasons: Array<string | null>, limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit)
    .map(([reason, count]) => `${reason}(${count})`);
}

function instagramError(row: InstagramActionRow): string | null {
  if (!isRecord(row.details)) return null;
  return normalizeReason(row.details.error);
}

export function extractExternalChannelLearningHints(
  input: ExternalChannelLearningInput,
  limit: number = DEFAULT_LIMIT,
): string[] {
  const instagramRows = input.instagramActions ?? [];
  const naverRows = input.naverAudits ?? [];
  const hints: string[] = [];

  const instagramFailures = instagramRows.filter(
    (row) => row.action === "instagram_publish_fail",
  );
  const instagramSuccessCount = instagramRows.filter(
    (row) => row.action === "instagram_publish_success",
  ).length;
  if (instagramFailures.length > 0) {
    const reasons = topReasons(instagramFailures.map(instagramError));
    hints.push(
      `인스타 최근 실패 ${instagramFailures.length}건${
        reasons.length > 0 ? `: ${reasons.join(", ")}` : ""
      }. 카드 제목·캡션은 짧고 안정적인 문장으로 유지하세요.`,
    );
  }
  if (instagramSuccessCount > 0) {
    hints.push(
      `인스타 최근 성공 ${instagramSuccessCount}건: 저장/검색 CTA와 3장 카드로 나눠도 어색하지 않은 핵심 문장을 유지하세요.`,
    );
  }

  const naverIssues = naverRows.filter(
    (row) => row.result === "fail" || row.result === "skipped",
  );
  const naverSuccessCount = naverRows.filter(
    (row) => row.result === "success",
  ).length;
  if (naverIssues.length > 0) {
    const reasons = topReasons(
      naverIssues.map(
        (row) =>
          normalizeReason(row.error_message) ??
          normalizeReason(row.skip_reason),
      ),
    );
    hints.push(
      `네이버 최근 보류/실패 ${naverIssues.length}건${
        reasons.length > 0 ? `: ${reasons.join(", ")}` : ""
      }. 복붙 후 깨지지 않게 문단을 짧게 나누고 공식 신청 경로를 분명히 쓰세요.`,
    );
  }
  if (naverSuccessCount > 0) {
    hints.push(
      `네이버 최근 성공 ${naverSuccessCount}건: 공식 경로·변동 가능성·제출 서류 확인 문장을 계속 유지하세요.`,
    );
  }

  return hints.slice(0, limit);
}

export async function getRecentExternalChannelLearningHints({
  limit = DEFAULT_LIMIT,
  lookbackMs = DEFAULT_LOOKBACK_MS,
}: {
  limit?: number;
  lookbackMs?: number;
} = {}): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - lookbackMs).toISOString();
    const [instagram, naver] = await Promise.all([
      admin
        .from("admin_actions")
        .select("action, details")
        .in("action", ["instagram_publish_fail", "instagram_publish_success"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(Math.max(limit * 2, 10)),
      admin
        .from("naver_publish_audit")
        .select("result, error_message, skip_reason")
        .gte("attempted_at", since)
        .order("attempted_at", { ascending: false })
        .limit(Math.max(limit * 2, 10)),
    ]);
    if (instagram.error && naver.error) return [];
    return extractExternalChannelLearningHints(
      {
        instagramActions: (instagram.data ?? []) as InstagramActionRow[],
        naverAudits: (naver.data ?? []) as NaverAuditRow[],
      },
      limit,
    );
  } catch {
    return [];
  }
}
