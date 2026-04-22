import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인한 사용자만 볼 수 있는 경로 목록
// 이 경로에 미로그인 상태로 접근하면 /login?next=<원래경로> 로 리다이렉트
const PROTECTED_PATHS = ["/mypage", "/alerts"];

// 모든 요청 전에 실행되는 미들웨어
// 1) Supabase 세션 쿠키를 갱신해서 로그인 상태 유지
// 2) 보호 경로에 미로그인 상태로 접근하면 로그인 페이지로 돌려보냄
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 현재 사용자 확인 (Supabase 공식 가이드 권장 방식)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 보호 경로 여부 확인
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // 미로그인 + 보호 경로 → 로그인 페이지로 (원래 가려던 곳을 next 에 담아둠)
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
