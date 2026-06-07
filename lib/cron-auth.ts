import { NextResponse } from "next/server";
import { safeKeyEqual } from "@/lib/safe-key-equal";

export function authorizeCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  // 2026-06-07 — 상수시간 비교(코드리뷰 P1, 타이밍 공격 방어).
  const authHeader = request.headers.get("authorization") ?? "";
  if (!safeKeyEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  return null;
}

export function authorizeOptionalCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  const authHeader = request.headers.get("authorization") ?? "";
  if (cronSecret && !safeKeyEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  return null;
}

export function authorizePrivateCronRequest(request: Request): NextResponse | null {
  if (!isPrivateCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  return null;
}

export function isPrivateCronRequestAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";

  return !!cronSecret && safeKeyEqual(authHeader, `Bearer ${cronSecret}`);
}

export function getCronAuthorizationHeader(): string | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return null;

  return `Bearer ${cronSecret}`;
}
