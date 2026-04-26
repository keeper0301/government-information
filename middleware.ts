import { NextResponse, type NextRequest } from "next/server";

// 2026-04-26 Supabase 외부 장애 응급 — middleware 임시 pass-through.
// Supabase auth 가 hang 중 (5121fbc rollback 으로도 504 지속 확정).
// updateSession 복구는 Supabase 정상 확인 후.
export async function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
