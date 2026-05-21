// app/api/notify-telegram/route.ts
// 텔레그램 봇 발송 endpoint — claude.ai routine 등 외부 서비스가 사장님께 알림 발송 시 사용.
// 인증: CRON_SECRET Bearer (다른 cron route 와 동일 패턴).
// env 의존: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return NextResponse.json(
      { error: "텔레그램 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text : "";
  if (!text) {
    return NextResponse.json({ error: "보낼 메시지 text 값이 필요합니다." }, { status: 400 });
  }

  // Telegram Bot API sendMessage — chat_id + text. parse_mode 는 호출자 책임 X (안전 default).
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json({ ok: res.ok, status: res.status, telegram: data });
}
