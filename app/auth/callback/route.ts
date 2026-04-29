import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/safe-next";
import {
  recordConsent,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/consent";
import { redeemReferral } from "@/lib/referrals";

// Phase 5 A3 — 추천 코드 쿠키 (middleware 가 ?ref=CODE 감지 시 30일 저장)
const REFERRAL_COOKIE = "kp_ref";

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
  // GA4 signup/login 이벤트 분기에도 재사용 — 블록 밖에서 참조 가능하게 let 선언.
  let isNewUser = false;
  if (user) {
    const admin = createAdminClient();
    const { data: existingProfile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    isNewUser = !existingProfile;

    if (isNewUser) {
      // 프로필 행 생성 (동시 로그인 경쟁 방어 위해 upsert)
      const { error: profileError } = await admin
        .from("user_profiles")
        .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
      if (profileError) {
        console.error("[auth/callback] 프로필 생성 실패:", profileError.message);
      }

      // Phase 5 A3 — 추천 코드 redeem (신규 가입자에 한해 1회)
      // middleware 가 ?ref=CODE 진입 시 저장한 kp_ref 쿠키 lookup.
      // 실패해도 가입 자체는 정상 진행 (graceful — 항상 결과 객체만 반환).
      const refCookie = request.headers
        .get("cookie")
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${REFERRAL_COOKIE}=`));
      const refCode = refCookie?.split("=")[1]?.trim();

      if (refCode) {
        try {
          const result = await redeemReferral(admin, refCode, user.id);
          if (!result.ok) {
            console.warn(
              `[auth/callback] referral redeem 실패: code=${refCode} reason=${result.reason}`,
            );
          }
        } catch (err) {
          console.error("[auth/callback] referral redeem 예외:", err);
        }
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

  // Phase 5 A3 — 추천 쿠키 정리. 신규 가입자라면 redeem 시도가 끝났으므로
  // 어떤 결과든 더 이상 보유할 필요 없음. 기존 사용자라면 가입 흐름이 아니라
  // 또 다른 ?ref 진입 가능성도 있어 그대로 두는 편이 안전 (그쪽이 가입하면
  // 그때 쿠키 redeem). 함수 헬퍼로 만들어 redirect 시 set-cookie 추가.
  function withReferralCleanup(redirectUrl: string): NextResponse {
    const res = NextResponse.redirect(redirectUrl);
    if (isNewUser) {
      res.cookies.set(REFERRAL_COOKIE, "", {
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: true,
      });
    }
    return res;
  }

  // ━━━ GA4 auth_event + auth_method 쿼리 마커 ━━━
  // /auth/callback 은 서버 route 라 gtag 직접 호출 불가.
  // redirect URL 에 auth_event + auth_method 쿼리를 실어 클라이언트(AuthEventTracker) 가
  // useEffect 로 감지 후 trackEvent 호출 + URL 에서 쿼리 제거.
  //
  // 위 블록의 isNewUser 그대로 재사용 (신규=signup, 기존=login).
  //
  // auth_method: Supabase user.app_metadata.provider + isNewUser 결합.
  //   - "kakao" · "google" : OAuth 소셜 로그인
  //   - "email" + isNewUser=true  → "signup_email" (가입 확인 메일 클릭)
  //   - "email" + isNewUser=false → "magic_link"   (재로그인용 매직링크)
  //   - undefined/null      : 추출 실패 → 전달 안 함
  //
  // 이메일+비밀번호 로그인은 callback 을 거치지 않음 (login/page.tsx 가 직접
  // method: "email_password" 로 trackEvent). 분석에서 가입 메일 vs 매직링크 구분이
  // 가능해야 매직링크 사용률·가입 funnel 을 따로 볼 수 있음.
  const authEventParam = user ? (isNewUser ? "signup" : "login") : "";
  const rawProvider = user?.app_metadata?.provider as string | undefined;
  const authMethodParam =
    rawProvider === "email"
      ? (isNewUser ? "signup_email" : "magic_link")
      : (rawProvider ?? "");

  // ━━━ 온보딩 분기 ━━━
  // next 파라미터가 명시되지 않은 (= 기본값 "/") 경우에만 온보딩 여부 확인.
  // 명시적 next 가 있으면 사용자가 특정 페이지를 목적지로 로그인한 것이므로 방해 안 함.
  //
  // 판정 기준: user_profiles 행이 없거나 dismissed_onboarding_at 이 NULL
  //   → 온보딩을 한 번도 완료(스킵 포함)하지 않은 사용자 → /onboarding 으로 우회.
  //
  // admin client 사용 — 위와 동일한 이유 (세션 쿠키 타이밍 문제 회피).
  if (user && next === "/") {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("dismissed_onboarding_at")
      .eq("id", user.id)
      .maybeSingle();

    // 프로필 행이 없거나 온보딩 완료 시각이 기록되지 않은 경우 → 첫 진입으로 판단
    const hasCompletedOnboarding =
      profile !== null && profile.dismissed_onboarding_at !== null;

    if (!hasCompletedOnboarding) {
      return withReferralCleanup(
        appendAuthEvent(`${origin}/onboarding`, authEventParam, authMethodParam),
      );
    }
  }

  // 정상 로그인 → 원래 가려던 페이지 또는 홈으로
  return withReferralCleanup(
    appendAuthEvent(`${origin}${next}`, authEventParam, authMethodParam),
  );
}

// redirect 대상 URL 에 auth_event + auth_method 쿼리 덧붙이는 헬퍼.
// event 가 빈 문자열이면 원본 URL 그대로 (비밀번호 재설정 등 이벤트 대상 아닌 흐름).
// method 는 선택적 — 빈 문자열이면 auth_method 쿼리 생략.
function appendAuthEvent(urlStr: string, event: string, method: string): string {
  if (!event) return urlStr;
  const u = new URL(urlStr);
  u.searchParams.set("auth_event", event);
  if (method) u.searchParams.set("auth_method", method);
  return u.toString();
}
