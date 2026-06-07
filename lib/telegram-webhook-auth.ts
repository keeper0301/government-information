import { NextResponse } from "next/server";
import { safeKeyEqual } from "@/lib/safe-key-equal";

export function authorizeTelegramWebhookRequest(request: Request): NextResponse | null {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  // 2026-06-07 — 상수시간 비교(코드리뷰 P1, 타이밍 공격 방어).
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeKeyEqual(got, expected)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  return null;
}
