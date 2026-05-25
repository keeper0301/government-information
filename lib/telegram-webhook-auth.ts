import { NextResponse } from "next/server";

export function authorizeTelegramWebhookRequest(request: Request): NextResponse | null {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const got = request.headers.get("x-telegram-bot-api-secret-token");
  if (got !== expected) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  return null;
}
