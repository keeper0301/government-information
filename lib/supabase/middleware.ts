import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkHiddenNews } from "@/lib/news-moderation/middleware-check";

// 2026-04-26 SVG 지도 504 사고 후 middleware 안 모든 외부 호출에 timeout 적용.
// Supabase auth/DB 호출이 hang 하면 middleware 30초 초과 → Vercel function
// timeout → 사이트 다운. 5초 timeout + safe fallback 으로 사고 재발 방지.
const SUPABASE_TIMEOUT_MS = 5000;

// Promise timeout helper — ms 안에 안 끝나면 fallback 반환.
// 주의: timeout 후에도 원본 promise 는 background 에서 계속 진행 (cancel 불가).
// JS GC 가 정리하므로 leak 우려 없음.
async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

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

  // 현재 사용자 확인 (Supabase 공식 가이드 권장 방식).
  // 5초 timeout — 정상 응답은 cold start 도 1~2초. timeout 시 비로그인 처리.
  // 부작용: 일시 장애 시 사용자가 mypage 등 보호 경로 접근하면 로그인 페이지로
  // 가지만, 504 사이트 다운보다 훨씬 안전.
  const user = await withTimeout(
    supabase.auth.getUser().then((r) => r.data?.user ?? null),
    SUPABASE_TIMEOUT_MS,
    null,
  );

  // 정책 뉴스 모더레이션 — hidden 단건 사전 차단 (anon 만 410, admin 통과)
  // /news/[slug] 가 아닌 요청엔 즉시 null 반환하므로 비용 거의 0.
  // timeout 시 차단 안 함 — hidden 뉴스가 일시적으로 보일 수 있으나 minor.
  const goneResponse = await withTimeout(
    checkHiddenNews(request, user),
    SUPABASE_TIMEOUT_MS,
    null,
  );
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
  // timeout 시 pending=null 처리 — 탈퇴 진행자가 일시적으로 통과 가능하나
  // RLS 로 본인 데이터만 보이므로 보안 영향 minor. 504 보다 안전.
  if (user && !isPendingAllowed(pathname)) {
    const pending = await withTimeout(
      supabase
        .from("pending_deletions")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then((r) => r.data),
      SUPABASE_TIMEOUT_MS,
      null,
    );

    if (pending) {
      const restoreUrl = request.nextUrl.clone();
      restoreUrl.pathname = "/account/restore";
      restoreUrl.search = "";
      return NextResponse.redirect(restoreUrl);
    }
  }

  return supabaseResponse;
}
