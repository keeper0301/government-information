// ============================================================
// 텔레그램 어드민 명령 — /status /trigger /revoke /restore.
// ============================================================
// 기존 명령 (mega session 에서 도입) 을 commands.ts 분리. ALLOWED_TRIGGERS
// 화이트리스트 + UUID 검증 + cron secret 인증 패턴.

import {
  revokeAutoConfirmed,
  restoreAutoConfirmed,
  listAutoConfirmedPolicies,
} from "@/lib/press-ingest/candidates";
import { isUuid, SITE_BASE } from "./utils";

export const ALLOWED_TRIGGERS = [
  "health-alert",
  "press-ingest",
  "news-classify",
  "daily-digest",
  "support-reminder",
  "cancellation-followup",
  "category-backfill",
  "blog-quality-check",
  "nps-invite",
  "sentry-daily-summary",
  "sns-publish-blog",
  "external-console-check",
  "weekly-ops-digest",
  "auto-confirm-stats",
  "policy-enrich",
  "llm-usage-summary",
  "failed-cron-retry",
] as const;

type AllowedTrigger = (typeof ALLOWED_TRIGGERS)[number];

export async function revokeCommand(args: string): Promise<string> {
  const id = args.trim();
  if (!isUuid(id)) return `❌ candidate_uuid 형식 오류\n사용법: /revoke {uuid}`;
  try {
    const r = await revokeAutoConfirmed({ candidateId: id, actorId: null });
    return `✅ 회수 완료\ntable: ${r.table}\nprogram_id: ${r.programId}`;
  } catch (e) {
    return `❌ 회수 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

// /recent — 24h 자동 등록 정책 5개 (revoke 명령 prefill).
// 미회수 + tier 무관 최신순. 모바일에서 잘못된 자동 등록을 즉시 회수 가능.
export async function recentCommand(): Promise<string> {
  const rows = await listAutoConfirmedPolicies({ sinceDays: 1 });
  if (rows.length === 0) return "✅ 24h 안 자동 등록 0건";
  const top = rows.slice(0, 5);
  const lines = [`[24h 자동 등록 — ${rows.length}건 중 최신 5]`, ""];
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const isRevoked = r.revoked_at !== null;
    const flag = isRevoked
      ? "↩️ 이미 회수"
      : r.is_hidden
        ? "👁️ 가려짐"
        : `[${r.auto_confirm_tier}]`;
    const t = r.table === "welfare_programs" ? "w" : "l";
    lines.push(`${i + 1}. ${flag} (${t}) ${(r.title ?? "").slice(0, 35)}`);
    if (!isRevoked) lines.push(`   /revoke ${r.candidate_id}`);
  }
  return lines.join("\n");
}

export async function restoreCommand(args: string): Promise<string> {
  const id = args.trim();
  if (!isUuid(id)) return `❌ candidate_uuid 형식 오류\n사용법: /restore {uuid}`;
  try {
    const r = await restoreAutoConfirmed({ candidateId: id, actorId: null });
    return `✅ 복원 완료\ntable: ${r.table}\nprogram_id: ${r.programId}`;
  } catch (e) {
    return `❌ 복원 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

export async function statusCommand(cronSecret: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${SITE_BASE}/api/auto-confirm-stats`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (e) {
    return `❌ 호출 실패: ${(e as Error).message.slice(0, 80)}`;
  }
  if (!res.ok) return `❌ stats endpoint HTTP ${res.status}`;
  const data = (await res.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!data) return "❌ 응답 파싱 실패";
  const fmt = (k: string) => String(data[k] ?? "?");
  return [
    "[24h]",
    `· 자동 등록 ${fmt("autoConfirm24h")} (high ${fmt("highCount24h")} / mid ${fmt("midCount24h")})`,
    `· 회수 ${fmt("autoRevoke24h")}`,
    "",
    "[7d]",
    `· 자동 등록 ${fmt("autoConfirm7d")} / 회수 ${fmt("autoRevoke7d")} / 회수율 ${fmt("revokeRate7d")}%`,
    `· mid 회수율 ${fmt("midRevokeRate7d")}%`,
    "",
    "[큐]",
    `· low ${fmt("pressLowTierBacklog")} / pending ${fmt("pressPending")} / news ${fmt("newsBacklog")}`,
    "",
    `기준: ${fmt("timestamp")}`,
  ].join("\n");
}

export async function triggerCommand(
  args: string,
  cronSecret: string,
): Promise<string> {
  const name = args.trim().toLowerCase();
  if (!name) return "사용법: /trigger {cron-name} — /help 에서 목록 확인";
  if (!(ALLOWED_TRIGGERS as readonly string[]).includes(name)) {
    return `❌ 허용되지 않은 cron: ${name}\n허용 목록은 /help 참고`;
  }
  const triggerName = name as AllowedTrigger;
  const path =
    triggerName === "auto-confirm-stats"
      ? "/api/auto-confirm-stats"
      : `/api/cron/${triggerName}`;

  let res: Response;
  try {
    res = await fetch(`${SITE_BASE}${path}`, {
      method: triggerName === "auto-confirm-stats" ? "GET" : "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (e) {
    return `❌ ${triggerName} 호출 실패: ${(e as Error).message.slice(0, 80)}`;
  }
  const body = await res.text().catch(() => "");
  return [
    `${res.ok ? "✅" : "❌"} /${triggerName} HTTP ${res.status}`,
    body.slice(0, 500),
  ].join("\n");
}
