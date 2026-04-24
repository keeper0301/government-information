import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/safe-next";
import {
  recordConsent,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/consent";

// OAuth 콜백 라우트
// 소셜 로그인(카카오·구글) 또는 이메일 매직링크 인증이 끝나면
// 사용자가 이 URL로 돌아옴. 인증 코드를 세션으로 교환하고 원래 가려던 곳으로 보냄.

// 요청 헤더에서 클라이언트 IP 추출 (Vercel 환경)
function getClientIp(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
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

  // 로그인 성공 → user_profiles 에 빈 프로필 보장 + 신규 사용자면 필수 동의 자동 기록
  //
  // ⚠️ admin client 로 처리하는 이유:
  //   exchangeCodeForSession 직후 같은 요청 안에서는 세션 쿠키가 아직 반영되지 않아
  //   SSR client 의 auth.uid() 가 null 로 평가됨. 그러면 user_profiles RLS
  //   (auth.uid() = id) 때문에 insert 가 거부되는 타이밍 버그가 있음.
  //   admin client 는 RLS 를 우회하므로 이 문제를 완전히 회피.
  //
  // 1) 기존 프로필이 있는지 먼저 확인해서 '신규 사용자' 판정
  //    - 있음: 재로그인 — 동의 기록 생략
  //    - 없음: 첫 로그인 — 프로필 생성 + privacy_policy / terms 자동 기록
  // 2) 동의 기록은 로그인 페이지·회원가입 폼에 "로그인/가입 시 동의" 문구 표시 전제
  //    (실제 동의 UI 는 회원가입 폼에서, OAuth 는 로그인 페이지 안내로 대체)
  const user = data.user;
  if (user) {
    const admin = createAdminClient();
    const { data: existingProfile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    const isNewUser = !existingProfile;

    if (isNewUser) {
      // 프로필 행 생성 (동시 로그인 경쟁 방어 위해 upsert)
      const { error: profileError } = await admin
        .from("user_profiles")
        .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
      if (profileError) {
        console.error("[auth/callback] 프로필 생성 실패:", profileError.message);
      }

      // 필수 동의 자동 기록 — 실패해도 로그인은 성공시킴
      // (개인정보처리방침·이용약관 은 "로그인/가입 완료" = 동의 로 간주)
      const ip = getClientIp(request);
      const ua = request.headers.get("user-agent") ?? undefined;
      try {
        await recordConsent({
          userId: user.id,
          consentType: "privacy_policy",
          version: PRIVACY_POLICY_VERSION,
          ipAddress: ip,
          userAgent: ua,
        });
        await recordConsent({
          userId: user.id,
          consentType: "terms",
          version: TERMS_VERSION,
          ipAddress: ip,
          userAgent: ua,
        });

        // 회원가입 폼에서 마케팅 수신 체크한 경우 (signUp options.data.marketing_consent)
        // OAuth 소셜 로그인은 이 플래그가 없음 → 마케팅 동의는 기본 미기록
        if (user.user_metadata?.marketing_consent === true) {
          await recordConsent({
            userId: user.id,
            consentType: "marketing",
            version: PRIVACY_POLICY_VERSION,
            ipAddress: ip,
            userAgent: ua,
          });
        }
      } catch (err) {
        console.error("[auth/callback] 필수 동의 기록 실패:", err);
      }
    }
  }

  // 비밀번호 재설정 흐름이면 새 비밀번호 입력 페이지로 이동
  // (이때 세션은 임시로 만들어진 상태이고, 새 비번을 저장하면 정상 세션이 됨)
  if (authType === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  // ━━━ 온보딩 분기 ━━━
  // next 파라미터가 명시되지 않은 (= 기본값 "/") 신규 사용자는
  // 관심 분야 선택 권유 페이지로. 이미 골라뒀거나 명시 next 가 있으면 패스.
  // CEO 리뷰 Q2: 권유 (스킵 가능, 미선택 시 전체 알림).
  //
  // admin client 사용 — 위와 동일한 이유 (세션 쿠키 타이밍 문제 회피).
  if (user && next === "/") {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("interests")
      .eq("id", user.id)
      .maybeSingle();
    const hasInterests =
      Array.isArray(profile?.interests) && profile!.interests!.length > 0;
    if (!hasInterests) {
      return NextResponse.redirect(`${origin}/onboarding/topics`);
    }
  }

  // 정상 로그인 → 원래 가려던 페이지 또는 홈으로
  return NextResponse.redirect(`${origin}${next}`);
}
