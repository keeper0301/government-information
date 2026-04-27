"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError, classifyAuthError } from "@/lib/auth-errors";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { SocialLoginButtons } from "@/components/social-login-buttons";

// 로그인 페이지 (Suspense wrapper).
// useSearchParams 는 Next.js 16 의 prerender 경계에서 bail-out 유발 →
// Suspense 경계로 감싸서 정적 렌더 부분과 격리.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

// 실제 로그인 폼 컴포넌트 (useSearchParams 사용).
// - 카카오/구글 소셜 로그인 버튼 (가장 간편)
// - 이메일 + 비밀번호 로그인 (기본 모드)
// - 이메일 매직링크 로그인 (비밀번호 없는 분을 위한 대안, 토글로 전환)
// - 회원가입 / 비밀번호 분실 보조 링크
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 이메일 폼 모드 — 'password' (기본) 또는 'magic' (메일 링크)
  const [mode, setMode] = useState<"password" | "magic">("password");

  // 입력값
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 매직링크 전송 완료 표시
  const [magicSent, setMagicSent] = useState(false);

  // 이메일 액션 실행 중 표시 (소셜은 SocialLoginButtons 내부에서 처리)
  const [loading, setLoading] = useState<"password" | "magic" | null>(null);

  // URL 쿼리는 마운트 시 1회만 읽어 state 초기값으로 사용 (useState lazy initializer).
  // useSearchParams 는 SSR·hydration 양쪽에서 동일한 URL 을 읽어주므로 mismatch 없음.
  // 이후 effect 에서 일회성 파라미터(error, reset)만 URL 에서 제거하고 next 는 유지.

  // 로그인 성공 후 돌아갈 페이지 (?next=/xxx).
  // 내부 경로만 허용 (외부 리다이렉트 방지) — 콜백 라우트 safeNext 와 동일 규칙:
  // - "/" 로 시작해야 (절대 경로)
  // - "//" 또는 "/\\" 시작은 외부 사이트로 해석될 수 있어 차단
  const next = useMemo(() => {
    const nextParam = searchParams.get("next");
    if (
      nextParam &&
      nextParam.startsWith("/") &&
      !nextParam.startsWith("//") &&
      !nextParam.startsWith("/\\")
    ) {
      return nextParam;
    }
    return "/";
  }, [searchParams]);

  // 콜백에서 넘어온 에러 메시지 (일회성 + form 제출 실패 시 덮어씀)
  const [error, setError] = useState(() => {
    const errMsg = searchParams.get("error");
    return errMsg ? translateAuthError(errMsg) : "";
  });
  // 비밀번호 변경 직후 진입 시 보여줄 성공 알림 (?reset=success)
  const [resetSuccess] = useState(
    () => searchParams.get("reset") === "success"
  );

  // URL 에서 일회성 파라미터(error, reset)만 제거 — next 는 유지.
  // setState 는 하지 않음 (initial state 는 이미 위에서 설정됨).
  // 초기 진입 시 error 쿼리가 있었다면 callback·OAuth 실패로 redirect 된 것이므로
  // LOGIN_FAILED 이벤트로도 기록 (trackEvent 는 side effect 라 rule 통과).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errMsg = params.get("error");
    if (errMsg || params.get("reset")) {
      params.delete("error");
      params.delete("reset");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? `?${query}` : "")
      );
    }
    if (errMsg) {
      trackEvent(EVENTS.LOGIN_FAILED, {
        reason: classifyAuthError(errMsg),
        method: "callback",
      });
    }
  }, []);

  // 이메일 + 비밀번호 로그인
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("password");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(translateAuthError(error.message));
      trackEvent(EVENTS.LOGIN_FAILED, {
        reason: classifyAuthError(error.message),
        method: "email_password",
      });
      setLoading(null);
      return;
    }
    // 이메일+비밀번호 로그인은 callback 을 거치지 않으므로 직접 GA4 이벤트.
    // (소셜·매직링크는 /auth/callback → auth_event 쿼리 → AuthEventTracker 가 처리)
    trackEvent(EVENTS.LOGIN_COMPLETED, { method: "email_password" });

    // 성공 — 원래 가려던 페이지(또는 홈) 로 이동 + 서버 컴포넌트 재검증
    router.push(next);
    router.refresh();
  }

  // 이메일 매직링크 로그인 (비밀번호 없이 메일 링크로)
  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("magic");
    const supabase = createClient();
    // 매직링크 클릭 시 돌아올 URL 에도 next 를 붙여서 복귀 경로 유지
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    if (error) {
      setError(translateAuthError(error.message));
      trackEvent(EVENTS.LOGIN_FAILED, {
        reason: classifyAuthError(error.message),
        method: "magic_link",
      });
    } else {
      setMagicSent(true);
    }
    setLoading(null);
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        로그인
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        소셜 계정으로 빠르게 시작하거나
        <br />
        이메일로 로그인하세요.
      </p>

      {/* 비밀번호 변경 완료 알림 (초록 톤) */}
      {resetSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700 leading-[1.5]">
          비밀번호가 변경되었어요. 새 비밀번호로 로그인해주세요.
        </div>
      )}

      {/* 공통 에러 메시지 (소셜 로그인·이메일·콜백 에러 모두 여기 표시) */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-4 text-sm text-red leading-[1.5]">
          {error}
        </div>
      )}

      {/* 소셜 로그인 4종 — 카카오 메인 + 구글·네이버·페이스북 원형.
          애플은 1단계 미포함 (Apple Developer Program 유료 $99/년 결정 후 추가). */}
      <SocialLoginButtons next={next} onError={setError} />
      <div className="mb-6" />


      {/* 동의 안내 — 신규 사용자는 로그인/가입 완료 시 약관·방침 동의로 간주
          (실제 consent_log 기록은 /auth/callback 에서 신규 사용자 판정 후 자동) */}
      <p className="text-[13px] text-grey-600 text-center mb-6 leading-[1.5]">
        로그인·가입 시{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-grey-700 underline hover:text-grey-900"
        >
          이용약관
        </a>
        과{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-grey-700 underline hover:text-grey-900"
        >
          개인정보처리방침
        </a>
        에
        <br />
        동의하는 것으로 간주됩니다.
      </p>

      {/* "또는" 구분선 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-grey-200" />
        <span className="text-[13px] text-grey-600">또는</span>
        <div className="flex-1 h-px bg-grey-200" />
      </div>

      {/* 이메일 로그인 영역 — 비밀번호 모드 vs 매직링크 모드 토글 */}
      {magicSent ? (
        // 매직링크 전송 완료 안내
        <div className="bg-blue-50 rounded-lg p-5 text-[15px] text-blue-600 font-medium leading-[1.6]">
          {email}로 로그인 링크를 보냈어요.
          <br />
          이메일을 확인해주세요.
        </div>
      ) : mode === "password" ? (
        // === 비밀번호 모드 ===
        <form onSubmit={handlePasswordSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
            autoComplete="email"
            className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            autoComplete="current-password"
            className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading === "password" ? "로그인 중..." : "로그인"}
          </button>
          {/* 모드 전환 — 매직링크로 */}
          <button
            type="button"
            onClick={() => {
              setMode("magic");
              setError("");
              setMagicSent(false);
            }}
            className="w-full text-center mt-3 text-[14px] text-grey-600 hover:text-grey-900 bg-transparent border-none cursor-pointer"
          >
            비밀번호 없이 이메일 링크로 받기
          </button>
        </form>
      ) : (
        // === 매직링크 모드 ===
        <form onSubmit={handleMagicSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
            autoComplete="email"
            className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading === "magic" ? "전송 중..." : "이메일로 로그인 링크 받기"}
          </button>
          {/* 모드 전환 — 비밀번호로 */}
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError("");
            }}
            className="w-full text-center mt-3 text-[14px] text-grey-600 hover:text-grey-900 bg-transparent border-none cursor-pointer"
          >
            비밀번호로 로그인하기
          </button>
        </form>
      )}

      {/* 보조 링크 — 비밀번호 분실 / 회원가입 */}
      {!magicSent && (
        <div className="mt-8 pt-6 border-t border-grey-100 flex items-center justify-between text-[14px]">
          <a
            href="/forgot-password"
            className="text-grey-600 no-underline hover:text-grey-900"
          >
            비밀번호를 잊으셨나요?
          </a>
          <a
            href="/signup"
            className="text-blue-500 font-semibold no-underline hover:underline"
          >
            회원가입
          </a>
        </div>
      )}
    </main>
  );
}
