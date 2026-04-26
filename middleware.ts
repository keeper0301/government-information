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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
