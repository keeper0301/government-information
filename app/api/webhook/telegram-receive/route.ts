// ============================================================
// 텔레그램 봇 webhook — 사장님 메시지 수신 + 명령 dispatcher.
// ============================================================
// 텔레그램 → POST {update_id, message: { from, chat, text, ... }}.
// 사장님 chat_id (TELEGRAM_CHAT_ID) 화이트리스트 + 비밀 토큰 검증.
//
// 응답: 명령 처리 결과를 같은 chat 으로 다시 발송 (sendMessage).

import { NextRequest, NextResponse } from "next/server";
import { dispatchCommand } from "@/lib/telegram/commands";

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

async function authorize(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }
  // 텔레그램 setWebhook 시 등록한 secret_token 이 X-Telegram-Bot-Api-Secret-Token 헤더로 옴.
  const got = request.headers.get("x-telegram-bot-api-secret-token");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function sendBackToTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
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

  // 화이트리스트 — 사장님 본인 chat_id 만 허용. TELEGRAM_CHAT_ID env 활용.
  const allowed = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim());
  if (!allowed.includes(String(chatId))) {
    // 등록 안 된 사용자의 메시지는 silently drop. 봇이 응답 X = 사칭 인지 어렵게.
    return NextResponse.json({ ok: true, skipped: "not_whitelisted" });
  }

  const cronSecret = process.env.CRON_SECRET ?? "";
  let reply: string;
  try {
    reply = await dispatchCommand({ chatId, text, cronSecret });
  } catch (e) {
    reply = `❌ 명령 처리 실패: ${(e as Error).message.slice(0, 80)}`;
  }

  await sendBackToTelegram(chatId, reply);
  return NextResponse.json({ ok: true, replied: true });
}
