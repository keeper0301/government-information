import { NextResponse, type NextRequest } from "next/server";

// 2026-04-26 SVG 사고 응급 조치 — middleware 임시 비활성화.
// Supabase auth/RPC 가 30초 timeout 안에 안 끝나서 광범위 504. P1·P2 fix
// (timeout + try/catch) 도 부족. matcher 그대로 두면 함수가 호출되지만
// 그냥 next() 만 반환 — Supabase 호출 일체 skip.
//
// 영향:
// - 로그인한 사용자 식별 안 됨 (보호 경로 통과 — mypage/alerts/checkout 등)
// - pending 탈퇴 사용자도 통과
// - hidden 뉴스 anon 노출 가능
// - 504 보다 훨씬 안전. 사이트 살아있는 게 우선.
//
// TODO: 안정화되면 lib/supabase/middleware.ts updateSession 복구.
export async function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
