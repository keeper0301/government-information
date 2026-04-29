import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 2026-04-26 Supabase NANO Disk IO Budget 고갈 사고 후 복구.
// updateSession 안에 Supabase 호출 모두 5초 timeout + try/catch 적용됨.
// 인스턴스도 NANO → MICRO 업그레이드 완료 — 이중 안전망.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // monitoring: Sentry tunnelRoute (next.config.ts withSentryConfig) — Sentry SDK 가
    // /monitoring/* 로 envelope POST 를 보내며, matcher 에 두면 매 호출마다 Supabase
    // updateSession 가 실행돼 NANO Disk IO 사고 (2026-04-26) 재발 위험 → 명시 제외.
    "/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
