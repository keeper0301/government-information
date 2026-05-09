// ============================================================
// 텔레그램 봇 명령 dispatcher — 사장님이 chat 으로 keepioo 운영 제어.
// ============================================================
// /test /status /trigger + /revoke {id} /restore {id}.
// env 변경 (dedupe / tier toggle) 은 Vercel PAT 필요 — 다음 iteration.

import {
  revokeAutoConfirmed,
  restoreAutoConfirmed,
} from "@/lib/press-ingest/candidates";

const SITE_BASE = "https://www.keepioo.com";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 화이트리스트로 등록 가능한 cron 명. 잘못된 path 호출 차단.
const ALLOWED_TRIGGERS = [
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
] as const;

type AllowedTrigger = (typeof ALLOWED_TRIGGERS)[number];

export interface CommandContext {
  chatId: number;
  text: string;
  cronSecret: string;
}

export async function dispatchCommand(ctx: CommandContext): Promise<string> {
  const trimmed = ctx.text.trim();
  if (!trimmed.startsWith("/")) {
    return "명령은 / 로 시작해야 해요. /help 입력해 사용 가능한 명령을 확인하세요.";
  }
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  const name = head?.toLowerCase() ?? "";
  const args = rest.join(" ").trim();

  switch (name) {
    case "help":
      return helpText();
    case "test":
      return "✅ 살아있어요. 텔레그램 양방향 봇 정상 가동 중.";
    case "status":
      return statusCommand(ctx.cronSecret);
    case "trigger":
      return triggerCommand(args, ctx.cronSecret);
    case "revoke":
      return revokeCommand(args);
    case "restore":
      return restoreCommand(args);
    default:
      return `알 수 없는 명령: /${name}\n\n${helpText()}`;
  }
}

function helpText(): string {
  return [
    "[keepioo 봇 명령]",
    "",
    "/help — 이 도움말",
    "/test — 봇 살아있는지 확인",
    "/status — 24h+7d 자동 등록·회수 통계",
    "/trigger {cron-name} — 수동 cron 실행 (예: /trigger press-ingest)",
    "/revoke {candidate_uuid} — 자동 등록 정책 회수",
    "/restore {candidate_uuid} — 회수된 정책 복원",
    "",
    "candidate_uuid 는 /admin/auto-confirmed 페이지에서 확인",
    "",
    "사용 가능 cron:",
    ...ALLOWED_TRIGGERS.map((t) => `  · ${t}`),
  ].join("\n");
}

async function revokeCommand(args: string): Promise<string> {
  const id = args.trim();
  if (!UUID_RE.test(id)) {
    return `❌ candidate_uuid 형식 오류\n사용법: /revoke {uuid}\n예: /revoke 12345678-1234-1234-1234-123456789abc`;
  }
  try {
    const result = await revokeAutoConfirmed({ candidateId: id, actorId: null });
    return `✅ 회수 완료\ntable: ${result.table}\nprogram_id: ${result.programId}`;
  } catch (e) {
    return `❌ 회수 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

async function restoreCommand(args: string): Promise<string> {
  const id = args.trim();
  if (!UUID_RE.test(id)) {
    return `❌ candidate_uuid 형식 오류\n사용법: /restore {uuid}\n예: /restore 12345678-1234-1234-1234-123456789abc`;
  }
  try {
    const result = await restoreAutoConfirmed({ candidateId: id, actorId: null });
    return `✅ 복원 완료\ntable: ${result.table}\nprogram_id: ${result.programId}`;
  } catch (e) {
    return `❌ 복원 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

async function statusCommand(cronSecret: string): Promise<string> {
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

async function triggerCommand(
  args: string,
  cronSecret: string,
): Promise<string> {
  const name = args.trim().toLowerCase();
  if (!name) return "사용법: /trigger {cron-name} — /help 에서 목록 확인";
  if (!(ALLOWED_TRIGGERS as readonly string[]).includes(name)) {
    return `❌ 허용되지 않은 cron: ${name}\n허용 목록은 /help 참고`;
  }
  const triggerName = name as AllowedTrigger;

  // /api/cron/{name} 호출 (CRON_SECRET 인증). auto-confirm-stats 만 다른 경로.
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
