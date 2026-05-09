// ============================================================
// 텔레그램 봇 명령 dispatcher — 사장님이 chat 으로 keepioo 운영 제어.
// ============================================================
// /admin/* 25 페이지 일상 운영 80% 를 봇 명령으로 노출. 각 helper 는
// lib/telegram/admin/{press,info,user,operate}.ts. dispatcher 는 분기만.

import {
  pressListCommand,
  pressConfirmCommand,
  pressDismissCommand,
} from "@/lib/telegram/admin/press";
import {
  newsListCommand,
  healthCommand,
  todayCommand,
  statsCommand,
  adminLinksCommand,
} from "@/lib/telegram/admin/info";
import { userLookupCommand } from "@/lib/telegram/admin/user";
import {
  ALLOWED_TRIGGERS,
  revokeCommand,
  restoreCommand,
  statusCommand,
  triggerCommand,
} from "@/lib/telegram/admin/operate";
import {
  dedupeListCommand,
  dedupeConfirmCommand,
  dedupeRejectCommand,
} from "@/lib/telegram/admin/dedupe";

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
    case "press":
      return pressDispatch(args);
    case "dedupe":
      return dedupeDispatch(args);
    case "news":
      return newsListCommand();
    case "health":
      return healthCommand(ctx.cronSecret);
    case "user":
      return userLookupCommand(args);
    case "today":
      return todayCommand();
    case "stats":
      return statsCommand(args);
    case "admin":
      return adminLinksCommand();
    default:
      return `알 수 없는 명령: /${name}\n\n${helpText()}`;
  }
}

// /press 는 sub-command 필수 (/press, /press confirm {uuid}, /press dismiss {uuid})
async function pressDispatch(args: string): Promise<string> {
  if (!args) return pressListCommand();
  const [sub, ...rest] = args.split(/\s+/);
  const uuid = rest.join(" ").trim();
  switch ((sub ?? "").toLowerCase()) {
    case "confirm":
      return pressConfirmCommand(uuid);
    case "dismiss":
    case "reject":
      return pressDismissCommand(uuid);
    default:
      return "사용법: /press | /press confirm {uuid} | /press dismiss {uuid}";
  }
}

// /dedupe — list / confirm {baseId} / reject {baseId}
async function dedupeDispatch(args: string): Promise<string> {
  if (!args) return dedupeListCommand();
  const [sub, ...rest] = args.split(/\s+/);
  const baseId = rest.join(" ").trim();
  switch ((sub ?? "").toLowerCase()) {
    case "confirm":
      return dedupeConfirmCommand(baseId);
    case "reject":
      return dedupeRejectCommand(baseId);
    default:
      return "사용법: /dedupe | /dedupe confirm {baseId} | /dedupe reject {baseId}";
  }
}

function helpText(): string {
  return [
    "[keepioo 봇 명령]",
    "",
    "── 기본 ──",
    "/help · /test · /status",
    "/trigger {cron-name} — 수동 cron 실행",
    "",
    "── 어드민 원격 ──",
    "/press — pending press 후보 5개",
    "/press confirm {uuid} — 자동 등록",
    "/press dismiss {uuid} — 후보 폐기",
    "/dedupe — pending 중복 후보 5개",
    "/dedupe confirm {baseId} — 중복 확정 (audit 기록)",
    "/dedupe reject {baseId} — 오탐 해제 (link 제거)",
    "/news — 분류 대기 뉴스 5개",
    "/health — 사이트 헬스 요약",
    "/user {이메일|UUID} — 사용자 lookup",
    "/today — 24h KPI",
    "/stats [welfare|loan|all] — enrich 진행률",
    "/admin — 어드민 빠른 링크",
    "",
    "── 자동 등록 회수 ──",
    "/revoke {uuid} — 자동 등록 정책 회수",
    "/restore {uuid} — 회수된 정책 복원",
    "",
    "사용 가능 cron:",
    ...ALLOWED_TRIGGERS.map((t) => `  · ${t}`),
  ].join("\n");
}
