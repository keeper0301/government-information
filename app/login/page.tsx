"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";

// 로그인 페이지
// - 카카오/구글 소셜 로그인 버튼 (가장 간편)
// - 이메일 + 비밀번호 로그인 (기본 모드)
// - 이메일 매직링크 로그인 (비밀번호 없는 분을 위한 대안, 토글로 전환)
// - 회원가입 / 비밀번호 분실 보조 링크
export default function LoginPage() {
  const router = useRouter();

  // 이메일 폼 모드 — 'password' (기본) 또는 'magic' (메일 링크)
  const [mode, setMode] = useState<"password" | "magic">("password");

  // 입력값
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 매직링크 전송 완료 표시
  const [magicSent, setMagicSent] = useState(false);
  // 비밀번호 변경 직후 진입 시 보여줄 성공 알림 (?reset=success)
  const [resetSuccess, setResetSuccess] = useState(false);

  const [error, setError] = useState("");
  // 어떤 액션이 실행 중인지 (중복 클릭 방지)
  const [loading, setLoading] = useState<
    "kakao" | "google" | "password" | "magic" | null
  >(null);

  // 로그인 성공 후 돌아갈 페이지 (?next=/xxx)
  // 예: /alerts 에 접근하려다 로그인 페이지로 온 사용자는 로그인 후 /alerts 로 복귀
  const [next, setNext] = useState("/");

  // URL 쿼리 파라미터 읽기 (?next, ?error, ?reset=success)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get("next");
    // 내부 경로만 허용 (외부 리다이렉트 방지)
    // 콜백 라우트의 safeNext 와 동일 규칙으로 통일:
    // - "/" 로 시작해야 (절대 경로)
    // - "//" 또는 "/\\" 시작은 외부 사이트로 해석될 수 있어 차단
    if (
      nextParam &&
      nextParam.startsWith("/") &&
      !nextParam.startsWith("//") &&
      !nextParam.startsWith("/\\")
    ) {
      setNext(nextParam);
    }
    // 콜백에서 넘어온 에러 메시지를 한국어로 번역해서 표시
    const errMsg = params.get("error");
    if (errMsg) {
      setError(translateAuthError(errMsg));
    }
    // 비밀번호 변경 완료 후 진입 시 알림
    if (params.get("reset") === "success") {
      setResetSuccess(true);
    }
    // URL 에서 일회성 파라미터(error, reset)만 제거 (next 는 유지)
    if (errMsg || params.get("reset")) {
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete("error");
      cleanParams.delete("reset");
      const query = cleanParams.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? `?${query}` : "")
      );
    }
  }, []);

  // 카카오/구글 소셜 로그인 시작
  // Supabase가 OAuth 인증 URL로 사용자를 보내고, 인증이 끝나면 /auth/callback 으로 돌아옴
  async function handleSocialLogin(provider: "kakao" | "google") {
    setError("");
    setLoading(provider);
    const supabase = createClient();
    // 콜백 URL에 next 를 붙여서 로그인 후 원래 페이지로 복귀시킴
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl },
    });
    // 성공 시엔 자동으로 리다이렉트되므로 여기 아래 코드는 실패 시에만 실행됨
    if (error) {
      setError(translateAuthError(error.message));
      setLoading(null);
    }
  }

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
      setLoading(null);
      return;
    }
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

      {/* 카카오 로그인 버튼 (공식 노랑 #FEE500) */}
      <button
        type="button"
        onClick={() => handleSocialLogin("kakao")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[#FEE500] text-black/85 rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:brightness-95 transition-all disabled:opacity-50 mb-3"
      >
        {/* 카카오 말풍선 로고 */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 3C5.58 3 2 5.76 2 9.17c0 2.19 1.47 4.11 3.68 5.19-.16.58-.58 2.11-.66 2.44-.1.41.15.4.31.29.13-.09 2.03-1.38 2.85-1.94.59.09 1.2.14 1.82.14 4.42 0 8-2.76 8-6.17S14.42 3 10 3z"
            fill="currentColor"
          />
        </svg>
        {loading === "kakao" ? "연결 중..." : "카카오로 계속하기"}
      </button>

      {/* 구글 로그인 버튼 (공식 흰색 + 테두리) */}
      <button
        type="button"
        onClick={() => handleSocialLogin("google")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-2 py-3 bg-white text-[#1F1F1F] border border-[#747775] rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-grey-50 transition-all disabled:opacity-50 mb-6"
      >
        {/* 구글 G 로고 (공식 4색) */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M19.6 10.23c0-.68-.06-1.36-.19-2.02H10v3.83h5.38c-.23 1.24-.94 2.29-2 2.99v2.49h3.23c1.9-1.75 2.99-4.32 2.99-7.29z"
          />
          <path
            fill="#34A853"
            d="M10 20c2.7 0 4.97-.9 6.62-2.43l-3.23-2.49c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.75-5.59-4.11H1.08v2.57C2.73 17.75 6.12 20 10 20z"
          />
          <path
            fill="#FBBC05"
            d="M4.41 11.93c-.21-.6-.32-1.25-.32-1.93s.12-1.32.32-1.93V5.5H1.08A9.98 9.98 0 0 0 0 10c0 1.62.39 3.14 1.08 4.5l3.33-2.57z"
          />
          <path
            fill="#EA4335"
            d="M10 3.96c1.47 0 2.78.5 3.82 1.49l2.86-2.86C14.97.99 12.7 0 10 0 6.12 0 2.73 2.25 1.08 5.5l3.33 2.57C5.19 5.71 7.4 3.96 10 3.96z"
          />
        </svg>
        {loading === "google" ? "연결 중..." : "Google로 계속하기"}
      </button>

      {/* 동의 안내 — 신규 사용자는 로그인/가입 완료 시 약관·방침 동의로 간주
          (실제 consent_log 기록은 /auth/callback 에서 신규 사용자 판정 후 자동) */}
      <p className="text-[12px] text-grey-600 text-center mb-6 leading-[1.5]">
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
