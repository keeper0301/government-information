import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 2026-04-26 Supabase NANO Disk IO Budget 고갈 사고 후 복구.
// updateSession 안에 Supabase 호출 모두 5초 timeout + try/catch 적용됨.
// 인스턴스도 NANO → MICRO 업그레이드 완료 — 이중 안전망.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 공개 SEO 페이지 캐시는 next.config/vercel.json 정적 헤더에 맡기고 proxy 에서 제외한다.
    // proxy 를 통과하는 요청은 Supabase session/ref 쿠키 처리가 필요하거나 보호/hidden 검사가 필요한 경로만 둔다.
    "/admin/:path*",
    "/mypage/:path*",
    "/alerts/:path*",
    "/checkout/:path*",
    "/account/restore/:path*",
    "/auth/:path*",
    "/news/:path*",
    {
      source: "/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      has: [{ type: "query", key: "ref" }],
    },
  ],
};
