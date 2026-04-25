import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkHiddenNews } from "@/lib/news-moderation/middleware-check";

// 로그인한 사용자만 볼 수 있는 경로 목록
// 이 경로(자기 자신 + 모든 하위)에 미로그인 상태로 접근하면
// /login?next=<원래경로> 로 리다이렉트
const PROTECTED_PATHS = ["/mypage", "/alerts", "/checkout"];

// 보호 경로 안에 있지만 비로그인도 봐야 하는 예외 (정확 매치)
// - /checkout/fail: 토스 결제가 실패한 사용자에게 안내를 보여주는 페이지
//   세션이 만료된 채로 토스에서 돌아오는 경우에도 메시지가 표시되어야 함
const PROTECTED_EXCEPTIONS = ["/checkout/fail"];

// pending_deletions row 있는 사용자가 예외적으로 접근할 수 있는 경로.
// 이 외 모든 경로는 /account/restore 로 강제 리다이렉트 (복구 or 즉시삭제 유도).
// - /account/restore: 복구 페이지 자체
// - /api/account/restore, /api/account/delete: 복구·즉시삭제 API (페이지에서 호출)
// - /auth/*: 로그인 callback / signOut 처리는 통과시켜 상태 정리 허용
const PENDING_ALLOWED_PREFIXES = [
  "/account/restore",
  "/api/account/restore",
  "/api/account/delete",
  "/auth/",
];

function isPendingAllowed(pathname: string): boolean {
  return PENDING_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

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

  // 정책 뉴스 모더레이션 — hidden 단건 사전 차단 (anon 만 410, admin 통과)
  // /news/[slug] 가 아닌 요청엔 즉시 null 반환하므로 비용 거의 0.
  const goneResponse = await checkHiddenNews(request, user);
  if (goneResponse) return goneResponse;

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

  // 로그인 상태 + pending 탈퇴 요청 상태 → 복구 페이지 외 모든 경로 차단.
  // RLS 가 SELECT 를 본인 row 로만 제한하므로 타인 상태는 노출 불가.
  // PK 조회라 비용 낮음. allowed 경로는 페이지·API 정상 흐름 유지.
  if (user && !isPendingAllowed(pathname)) {
    const { data: pending } = await supabase
      .from("pending_deletions")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pending) {
      const restoreUrl = request.nextUrl.clone();
      restoreUrl.pathname = "/account/restore";
      restoreUrl.search = "";
      return NextResponse.redirect(restoreUrl);
    }
  }

  return supabaseResponse;
}
