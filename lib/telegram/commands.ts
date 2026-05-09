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
import { queueCommand } from "@/lib/telegram/admin/queue";
import { userLookupCommand } from "@/lib/telegram/admin/user";
import {
  revokeCommand,
  restoreCommand,
  statusCommand,
  triggerCommand,
  recentCommand,
} from "@/lib/telegram/admin/operate";
import {
  dedupeListCommand,
  dedupeConfirmCommand,
  dedupeRejectCommand,
} from "@/lib/telegram/admin/dedupe";
import {
  envListCommand,
  envSetCommand,
  redeployCommand,
} from "@/lib/telegram/admin/vercel";
import {
  publishBlogCommand,
  publishPreviewCommand,
  publishIndexnowCommand,
} from "@/lib/telegram/admin/content";
import { helpText } from "@/lib/telegram/admin/help";
import { canExecute, denyMessage, type Role } from "@/lib/telegram/permissions";

export interface CommandContext {
  chatId: number;
  text: string;
  cronSecret: string;
  /** RBAC role — webhook receive 가 getRole 로 결정해 전달 */
  role: Role;
}

export async function dispatchCommand(ctx: CommandContext): Promise<string> {
  const trimmed = ctx.text.trim();
  if (!trimmed.startsWith("/")) {
    return "명령은 / 로 시작해야 해요. /help 입력해 사용 가능한 명령을 확인하세요.";
  }
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  const name = head?.toLowerCase() ?? "";
  const args = rest.join(" ").trim();

  // RBAC — 명령 실행 권한 체크. matrix 에 없는 명령은 owner 만.
  if (!canExecute(ctx.role, name)) {
    return denyMessage(ctx.role, name);
  }

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
    case "env":
      return envDispatch(args);
    case "redeploy":
      return redeployCommand();
    case "publish":
      return publishDispatch(args, ctx.cronSecret);
    case "recent":
      return recentCommand();
    case "queue":
      return queueCommand();
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

// /env — 화이트리스트 list / set {KEY} {VALUE}
async function envDispatch(args: string): Promise<string> {
  if (!args) return envListCommand();
  const [sub, ...rest] = args.split(/\s+/);
  const setArgs = rest.join(" ").trim();
  switch ((sub ?? "").toLowerCase()) {
    case "set":
      return envSetCommand(setArgs);
    default:
      return "사용법: /env | /env set {KEY} {값}";
  }
}

// /publish — blog [카테고리] / preview [카테고리] / indexnow
async function publishDispatch(
  args: string,
  cronSecret: string,
): Promise<string> {
  if (!args) {
    return [
      "사용법:",
      "/publish blog [카테고리] — 즉시 발행",
      "/publish preview [카테고리] — 미리보기 (DB 저장 안 함)",
      "/publish indexnow — 색인 ping",
    ].join("\n");
  }
  const [sub, ...rest] = args.split(/\s+/);
  const subArgs = rest.join(" ").trim();
  switch ((sub ?? "").toLowerCase()) {
    case "blog":
      return publishBlogCommand(subArgs, cronSecret);
    case "preview":
      return publishPreviewCommand(subArgs, cronSecret);
    case "indexnow":
      return publishIndexnowCommand(cronSecret);
    default:
      return `❌ 알 수 없는 sub: ${sub}\n/publish blog | preview | indexnow`;
  }
}

