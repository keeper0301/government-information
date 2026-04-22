import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth 콜백 라우트
// 소셜 로그인(카카오·구글) 또는 이메일 매직링크 인증이 끝나면
// 사용자가 이 URL로 돌아옴. 인증 코드를 세션으로 교환하고 원래 가려던 곳으로 보냄.
// next 쿼리로 들어온 경로가 "우리 사이트 내부"인지 검증
// - "/" 로 시작해야 함 (절대 경로)
// - "//..." 로 시작하면 안 됨 (프로토콜 생략 URL = 외부 사이트 리다이렉트 공격)
// - "/\\..." 처럼 역슬래시도 차단 (일부 브라우저가 //로 해석할 수 있음)
function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // 로그인 후 이동할 페이지 (없거나 외부 URL이면 홈으로 강제)
  const next = safeNext(searchParams.get("next"));
  // OAuth 제공사가 에러를 돌려준 경우 (예: 사용자가 동의 취소)
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");

  // OAuth 제공사 측에서 에러가 온 경우 로그인 페이지로 돌려보냄
  if (oauthError) {
    const reason = oauthErrorDescription || oauthError;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(reason)}`
    );
  }

  // 인증 코드가 없으면 잘못된 접근이므로 로그인 페이지로
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // 인증 코드를 세션(로그인 상태)으로 교환
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  // 교환 실패 시 사용자에게 원인 전달
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // 로그인 성공 → user_profiles 테이블에 빈 프로필이 있는지 확인
  // 없으면 생성 (첫 로그인 시 1회만). 실패해도 로그인 자체는 성공시킴.
  const user = data.user;
  if (user) {
    // RLS 때문에 본인 id 로만 조회 가능 — 이미 세션이 있으니 허용됨
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      // 빈 프로필 생성 — 나이·지역·직업은 나중에 /mypage 에서 입력받음
      await supabase.from("user_profiles").insert({ id: user.id });
    }
  }

  // 정상 로그인 → 원래 가려던 페이지 또는 홈으로
  return NextResponse.redirect(`${origin}${next}`);
}
