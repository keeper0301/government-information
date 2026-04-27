"use client";

// ============================================================
// SocialLoginButtons — 4종(카카오·구글·네이버·페이스북) 통합
// ============================================================
// 카카오는 한국 메인 사용자라 첫 줄 큰 버튼으로 강조.
// 구글·네이버·페이스북은 사용자 메인 이미지 디자인 (원형 아이콘).
// 애플은 Apple Developer Program 유료($99/년) 라 1단계 미포함.
//
// 활성화 상태:
//   - 카카오: ✅ 즉시 동작 (Supabase auth.kakao 활성)
//   - 구글: ✅ 즉시 동작 (Supabase auth.google 활성)
//   - 페이스북: ⏳ Supabase 콘솔에 facebook provider 활성화 시 동작
//                (개발자센터 앱 등록 → Client ID/Secret → Supabase 입력)
//   - 네이버: ⏳ Supabase 미지원 (Edge Function 별도 구현 필요, 후속 작업)
//
// 버튼 클릭 → 각 provider 로 OAuth 시작 → /auth/callback 으로 복귀.
// 미준비 provider 클릭 시 인라인 안내 메시지로 표시.
// ============================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError, classifyAuthError } from "@/lib/auth-errors";
import { trackEvent, EVENTS } from "@/lib/analytics";

// 활성/비활성 표시 — 향후 네이버 활성 시 enabled 만 true 로 바꿈
// 2026-04-27 Facebook 활성화 (Supabase auth.facebook 등록 완료, keepio 정책알리미 앱 ID 26781325754856837)
const PROVIDER_STATUS = {
  kakao: { enabled: true, label: "카카오로 계속하기" },
  google: { enabled: true, label: "Google" },
  facebook: { enabled: true, label: "Facebook" },
  naver: { enabled: false, label: "네이버" },
} as const;

type Provider = keyof typeof PROVIDER_STATUS;

export function SocialLoginButtons({
  next,
  onError,
}: {
  /** 로그인 성공 후 돌아갈 내부 경로 (예: "/" 또는 "/welfare/abc"). */
  next: string;
  /** 에러 발생 시 부모 컴포넌트에 알리는 콜백 (login 페이지의 빨강 박스). */
  onError: (message: string) => void;
}) {
  // 진행 중 provider — 동시 클릭 방지용
  const [busy, setBusy] = useState<Provider | null>(null);
  // 미활성 provider 클릭 시 보여줄 안내 (인라인)
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSocialLogin(provider: Provider) {
    onError("");
    setNotice(null);

    // 비활성 provider — 안내만 띄우고 종료
    if (!PROVIDER_STATUS[provider].enabled) {
      setNotice(
        provider === "naver"
          ? "네이버 로그인은 곧 출시될 예정이에요. 카카오·구글·이메일로 로그인해주세요."
          : "페이스북 로그인 준비 중이에요. 카카오·구글·이메일로 로그인해주세요.",
      );
      trackEvent(EVENTS.LOGIN_FAILED, {
        reason: "provider_not_ready",
        method: provider,
        stage: "init",
      });
      return;
    }

    setBusy(provider);
    const supabase = createClient();
    // 콜백 URL 에 next 를 붙여 로그인 후 원래 페이지로 복귀
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    // 위 enabled=false 분기에서 naver 는 이미 return 됐으므로 여기는
    // Supabase 가 지원하는 provider 만 도달. 타입 좁히기.
    const supabaseProvider = provider as "kakao" | "google" | "facebook";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: supabaseProvider,
      options: { redirectTo: callbackUrl },
    });
    // 성공 시엔 자동 리다이렉트 → 아래 코드는 실패 시에만 실행
    if (error) {
      onError(translateAuthError(error.message));
      trackEvent(EVENTS.LOGIN_FAILED, {
        reason: classifyAuthError(error.message),
        method: provider,
        stage: "init",
      });
      setBusy(null);
    }
  }

  return (
    <>
      {/* 카카오 — 한국 메인. 첫 줄 큰 노란 버튼 (공식 #FEE500). */}
      <button
        type="button"
        onClick={() => handleSocialLogin("kakao")}
        disabled={busy !== null}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[#FEE500] text-black/85 rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:brightness-95 transition-all disabled:opacity-50 mb-4"
      >
        {/* 카카오 말풍선 로고 */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 3C5.58 3 2 5.76 2 9.17c0 2.19 1.47 4.11 3.68 5.19-.16.58-.58 2.11-.66 2.44-.1.41.15.4.31.29.13-.09 2.03-1.38 2.85-1.94.59.09 1.2.14 1.82.14 4.42 0 8-2.76 8-6.17S14.42 3 10 3z"
            fill="currentColor"
          />
        </svg>
        {busy === "kakao" ? "연결 중..." : "카카오로 계속하기"}
      </button>

      {/* 또는 구분 — 다른 소셜 진입 안내 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-grey-200" />
        <span className="text-[12px] text-grey-500">또는 다른 계정으로</span>
        <div className="flex-1 h-px bg-grey-200" />
      </div>

      {/* 원형 아이콘 3종 — 사용자 메인 이미지 디자인 (큰 원, 로고 중앙) */}
      <div className="flex items-center justify-center gap-5 mb-4">
        <SocialCircleButton
          provider="google"
          busy={busy}
          onClick={() => handleSocialLogin("google")}
        />
        <SocialCircleButton
          provider="naver"
          busy={busy}
          onClick={() => handleSocialLogin("naver")}
        />
        <SocialCircleButton
          provider="facebook"
          busy={busy}
          onClick={() => handleSocialLogin("facebook")}
        />
      </div>

      {/* 미활성 provider 클릭 시 인라인 안내 (회색 톤) */}
      {notice && (
        <div className="bg-grey-50 border border-grey-200 rounded-lg p-3 mb-4 text-sm text-grey-700 leading-[1.5]">
          {notice}
        </div>
      )}
    </>
  );
}

// ━━━ 원형 소셜 버튼 1종 ━━━
// 사용자 메인 이미지 디자인 — 56px 원, 브랜드 컬러 배경, 로고 흰색 중앙.
// 비활성 시에도 표시는 동일하지만 클릭 시 안내 메시지만 띄움 (UX: "준비 중" 명시).
function SocialCircleButton({
  provider,
  busy,
  onClick,
}: {
  provider: "google" | "naver" | "facebook";
  busy: Provider | null;
  onClick: () => void;
}) {
  const status = PROVIDER_STATUS[provider];
  const isLoading = busy === provider;

  // provider 별 배경색·로고 (이미지 디자인 매칭)
  // - 구글: 흰 배경 + 4색 로고 (테두리)
  // - 네이버: 초록 #03C75A + 흰 N
  // - 페이스북: 파랑 #1877F2 + 흰 f
  const styles: Record<typeof provider, string> = {
    google: "bg-white border border-grey-200 hover:bg-grey-50",
    naver: "bg-[#03C75A] hover:brightness-95",
    facebook: "bg-[#1877F2] hover:brightness-95",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      aria-label={`${status.label}로 계속하기`}
      title={status.enabled ? `${status.label}로 계속하기` : `${status.label} 준비 중`}
      className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 ${styles[provider]}`}
    >
      {provider === "google" && <GoogleLogo />}
      {provider === "naver" && <NaverLogo />}
      {provider === "facebook" && <FacebookLogo />}

      {/* 비활성 표시 — 우측 상단 작은 점 (회색) */}
      {!status.enabled && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-grey-400 border-2 border-white"
          title="준비 중"
        />
      )}
      {isLoading && (
        <span className="sr-only">연결 중</span>
      )}
    </button>
  );
}

// ━━━ provider 별 로고 SVG ━━━
function GoogleLogo() {
  // 구글 공식 4색 G 로고 (24px)
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true">
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.19-2.02H10v3.83h5.38c-.23 1.24-.94 2.29-2 2.99v2.49h3.23c1.9-1.75 2.99-4.32 2.99-7.29z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.97-.9 6.62-2.43l-3.23-2.49c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.75-5.59-4.11H1.08v2.57C2.73 17.75 6.12 20 10 20z" />
      <path fill="#FBBC05" d="M4.41 11.93c-.21-.6-.32-1.25-.32-1.93s.12-1.32.32-1.93V5.5H1.08A9.98 9.98 0 0 0 0 10c0 1.62.39 3.14 1.08 4.5l3.33-2.57z" />
      <path fill="#EA4335" d="M10 3.96c1.47 0 2.78.5 3.82 1.49l2.86-2.86C14.97.99 12.7 0 10 0 6.12 0 2.73 2.25 1.08 5.5l3.33 2.57C5.19 5.71 7.4 3.96 10 3.96z" />
    </svg>
  );
}

function NaverLogo() {
  // 네이버 공식 N 로고 — 흰 N 형태 (배경은 컨테이너의 초록)
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="white"
        d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727z"
      />
    </svg>
  );
}

function FacebookLogo() {
  // 페이스북 공식 f 로고 — 흰 f (배경은 컨테이너의 파랑)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="white"
        d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z"
      />
    </svg>
  );
}
