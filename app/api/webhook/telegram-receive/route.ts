// ============================================================
// 텔레그램 봇 webhook — 사장님 메시지 수신 + 명령 dispatcher.
// ============================================================
// 텔레그램 → POST {update_id, message: { from, chat, text, ... }}.
// 사장님 chat_id (TELEGRAM_CHAT_ID) 화이트리스트 + 비밀 토큰 검증.
//
// 응답: 명령 처리 결과를 같은 chat 으로 다시 발송 (sendMessage).

import { NextRequest, NextResponse } from "next/server";
import { dispatchCommand } from "@/lib/telegram/commands";
import { getRole, loadRoleSets } from "@/lib/telegram/permissions";
import { authorizeTelegramWebhookRequest } from "@/lib/telegram-webhook-auth";
import { getCronAuthorizationHeader } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; username?: string };
    chat?: { id?: number; type?: string };
    text?: string;
  };
}

async function sendBackToTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram-receive] TELEGRAM_BOT_TOKEN 미설정 — 응답 발송 스킵");
    return;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const denied = authorizeTelegramWebhookRequest(request);
  if (denied) return denied;

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text ?? "";

  if (!chatId || !text) {
    // 텔레그램 update 형식 다양 (channel_post, edited_message 등). 단순 무시.
    return NextResponse.json({ ok: true, skipped: "no_text_message" });
  }

  // RBAC 화이트리스트 — owner / staff / dev 3 role 합집합.
  // backward compat: 기존 TELEGRAM_CHAT_ID 는 owner 로 자동 매핑 (loadRoleSets 안에서).
  const sets = loadRoleSets();
  const role = getRole(chatId, sets);
  if (!role) {
    // 등록 안 된 사용자의 메시지는 silently drop. 봇이 응답 X = 사칭 인지 어렵게.
    return NextResponse.json({ ok: true, skipped: "not_whitelisted" });
  }

  const cronAuthorizationHeader = getCronAuthorizationHeader();
  let reply: string;
  try {
    reply = await dispatchCommand({ chatId, text, cronAuthorizationHeader, role });
  } catch (e) {
    reply = `❌ 명령 처리 실패: ${(e as Error).message.slice(0, 80)}`;
  }

  await sendBackToTelegram(chatId, reply);
  return NextResponse.json({ ok: true, replied: true });
}
