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
  // 인증 흐름 종류 (Supabase 가 메일 링크에 type 파라미터를 붙여서 보냄)
  // - "recovery": 비밀번호 재설정 메일에서 온 경우 → 새 비밀번호 입력 페이지로 보냄
  // - 그 외(매직링크, OAuth, 가입 확인 등): 평소대로 next 페이지로
  const authType = searchParams.get("type");
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

  // 로그인 성공 → user_profiles 에 빈 프로필 보장 (없으면 생성)
  // upsert + ignoreDuplicates 로 한 쿼리로 원자적 처리
  // (동시 로그인·재시도에도 안전하고, 이미 있으면 아무것도 안 함)
  const user = data.user;
  if (user) {
    const { error: profileError } = await supabase
      .from("user_profiles")
      .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
    // 프로필 생성 실패해도 로그인 자체는 성공시킴 (나중에 /mypage 에서 재시도됨)
    // 서버 로그에만 남김
    if (profileError) {
      console.error("[auth/callback] 프로필 생성 실패:", profileError.message);
    }
  }

  // 비밀번호 재설정 흐름이면 새 비밀번호 입력 페이지로 이동
  // (이때 세션은 임시로 만들어진 상태이고, 새 비번을 저장하면 정상 세션이 됨)
  if (authType === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  // 정상 로그인 → 원래 가려던 페이지 또는 홈으로
  return NextResponse.redirect(`${origin}${next}`);
}
