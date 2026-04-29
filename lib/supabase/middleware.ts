import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkHiddenNews } from "@/lib/news-moderation/middleware-check";

// 2026-04-26 SVG 사고 후속 — Supabase 외부 호출에 5초 timeout + try/catch.
// Supabase 인스턴스 IO 한도 고갈 등으로 hang 시 middleware 자체가 30초 초과
// → Vercel function timeout → 504 사이클. timeout + try/catch 안전망으로 차단.
//
// 직접 트리거: Pro Plan 가입했지만 NANO 인스턴스 그대로 → Disk IO Budget 고갈
// → auth/db 호출이 매우 느려짐 → middleware hang. (사고 사후 MICRO 업그레이드)
// memory: project_svg_map_504_incident_2026_04_26.md
const SUPABASE_TIMEOUT_MS = 5000;

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  } catch (e) {
    console.error("[middleware] withTimeout caught error", e);
    return fallback;
  }
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

// Phase 5 A3 — 추천 코드 쿠키 (?ref=CODE 진입 시 30일 저장)
// 가입 callback 에서 이 쿠키를 읽어 redeemReferral 호출.
// 6자리 base32 만 허용 (다른 값은 무시 — 임의 데이터 저장 차단).
const REFERRAL_COOKIE = "kp_ref";
const REFERRAL_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // 30일
const REFERRAL_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{6}$/;

// 모든 요청 전에 실행되는 미들웨어
// 1) Supabase 세션 쿠키를 갱신해서 로그인 상태 유지
// 2) 보호 경로에 미로그인 상태로 접근하면 로그인 페이지로 돌려보냄
// 3) ?ref=CODE 쿼리 있으면 추천 코드 30일 쿠키 저장 (가입 callback 에서 사용)
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Phase 5 A3 — ?ref=CODE 감지 → 30일 쿠키 저장.
  // 형식 검증된 코드만 저장 → 임의 값 주입 차단. SameSite=Lax (외부 링크 진입 허용).
  // 기존 쿠키가 있어도 덮어씀 (가장 최근 추천인 우선 정책).
  const refCode = request.nextUrl.searchParams.get("ref");
  if (refCode && REFERRAL_CODE_PATTERN.test(refCode.toUpperCase())) {
    supabaseResponse.cookies.set(REFERRAL_COOKIE, refCode.toUpperCase(), {
      maxAge: REFERRAL_COOKIE_MAX_AGE_S,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: true,
    });
  }

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
  // 5초 timeout — hang 시 user=null 처리 (사용자가 보호 경로 가면 로그인 페이지로).
  const user = await withTimeout(
    supabase.auth.getUser().then((r) => r.data?.user ?? null),
    SUPABASE_TIMEOUT_MS,
    null,
  );

  // 정책 뉴스 모더레이션 — hidden 단건 사전 차단 (anon 만 410, admin 통과)
  // /news/[slug] 가 아닌 요청엔 즉시 null 반환하므로 비용 거의 0.
  // timeout 시 차단 안 함 — hidden 뉴스 일시 노출 가능 (minor).
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
  // timeout 시 pending=null 처리 — 탈퇴 진행자 일시 통과 가능하나 RLS 보호.
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
