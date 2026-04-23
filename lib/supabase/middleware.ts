import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인한 사용자만 볼 수 있는 경로 목록
// 이 경로(자기 자신 + 모든 하위)에 미로그인 상태로 접근하면
// /login?next=<원래경로> 로 리다이렉트
const PROTECTED_PATHS = ["/mypage", "/alerts", "/checkout"];

// 보호 경로 안에 있지만 비로그인도 봐야 하는 예외 (정확 매치)
// - /checkout/fail: 토스 결제가 실패한 사용자에게 안내를 보여주는 페이지
//   세션이 만료된 채로 토스에서 돌아오는 경우에도 메시지가 표시되어야 함
const PROTECTED_EXCEPTIONS = ["/checkout/fail"];

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

  // 보호 경로 여부 확인 — 예외 경로면 보호 대상이 아님
  const { pathname } = request.nextUrl;
  const isException = PROTECTED_EXCEPTIONS.includes(pathname);
  const isProtected =
    !isException &&
    PROTECTED_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

  // 미로그인 + 보호 경로 → 로그인 페이지로 (원래 가려던 곳을 next 에 담아둠)
  // pathname 뿐 아니라 search(?tier=basic 같은 쿼리)까지 함께 보존해야
  // 로그인 후 사용자가 의도한 화면(요금제 선택 결과 등)으로 정확히 복귀 가능
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const originalPath = pathname + request.nextUrl.search;
    loginUrl.search = `?next=${encodeURIComponent(originalPath)}`;
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
