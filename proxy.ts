import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PAGE_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=31449600";
const PUBLIC_SHORT_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=31535940";

const PUBLIC_CACHE_PATHS = new Map<string, string>([
  ["/help", PUBLIC_PAGE_CACHE_CONTROL],
  ["/privacy", PUBLIC_PAGE_CACHE_CONTROL],
  ["/terms", PUBLIC_PAGE_CACHE_CONTROL],
  ["/refund", PUBLIC_PAGE_CACHE_CONTROL],
  ["/consult", PUBLIC_PAGE_CACHE_CONTROL],
  ["/login", PUBLIC_PAGE_CACHE_CONTROL],
  ["/signup", PUBLIC_PAGE_CACHE_CONTROL],
  ["/signup/sent", PUBLIC_PAGE_CACHE_CONTROL],
  ["/forgot-password", PUBLIC_PAGE_CACHE_CONTROL],
  ["/reset-password", PUBLIC_PAGE_CACHE_CONTROL],
  ["/guides", PUBLIC_SHORT_CACHE_CONTROL],
]);

// 2026-04-26 Supabase NANO Disk IO Budget 고갈 사고 후 복구.
// updateSession 안에 Supabase 호출 모두 5초 timeout + try/catch 적용됨.
// 인스턴스도 NANO → MICRO 업그레이드 완료 — 이중 안전망.
export async function proxy(request: NextRequest) {
  const cacheControl = PUBLIC_CACHE_PATHS.get(request.nextUrl.pathname);
  // ref 링크는 추천코드 쿠키 저장이 필요하므로 updateSession 으로 보낸다.
  if (cacheControl && !request.nextUrl.searchParams.has("ref")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", cacheControl);
    return response;
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 2026-07-17 — 공개 SEO 페이지 캐시 복구.
    // 이전엔 모든 HTML 요청이 proxy 를 거치며 Supabase 세션 확인을 실행했고,
    // 정적 페이지(/help, /guides)까지 Vercel 에서 `private, no-store` 로 내려갔다.
    // 인증·결제·관리·hidden news 검사가 필요한 경로, 추천코드(ref) 진입,
    // 그리고 Vercel runtime 이 no-store 로 덮는 안전한 공개 정적 페이지의 cache header 보정만 proxy 에 태운다.
    "/help",
    "/privacy",
    "/terms",
    "/refund",
    "/consult",
    "/login",
    "/signup",
    "/signup/sent",
    "/forgot-password",
    "/reset-password",
    "/guides",
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
