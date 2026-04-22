"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";

// 로그인 페이지
// - 카카오/구글 소셜 로그인 버튼 (빠른 가입)
// - 이메일 매직링크 (소셜 계정이 없는 사용자용 대안)
export default function LoginPage() {
  // 이메일 입력값과 전송 상태 관리
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  // 어떤 소셜 버튼이 눌렸는지 (중복 클릭 방지용)
  const [loading, setLoading] = useState<"kakao" | "google" | null>(null);

  // 로그인 성공 후 돌아갈 페이지 (?next=/xxx)
  // 예: /alerts 에 접근하려다 로그인 페이지로 온 사용자는 로그인 후 /alerts 로 복귀
  const [next, setNext] = useState("/");

  // URL 쿼리 파라미터 읽기 (?next, ?error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get("next");
    // 내부 경로만 허용 (외부 리다이렉트 방지)
    if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
      setNext(nextParam);
    }
    // 콜백에서 넘어온 에러 메시지를 한국어로 번역해서 표시
    const errMsg = params.get("error");
    if (errMsg) {
      setError(translateAuthError(errMsg));
      // URL 에서 error 파라미터만 제거 (next 는 유지)
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete("error");
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

  // 이메일 매직링크 방식 로그인 (기존 유지)
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
      setSent(true);
    }
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        로그인
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        소셜 계정으로 빠르게 시작하거나
        <br />
        이메일로 로그인 링크를 받으세요.
      </p>

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

      {/* "또는" 구분선 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-grey-200" />
        <span className="text-[13px] text-grey-500">또는</span>
        <div className="flex-1 h-px bg-grey-200" />
      </div>

      {/* 이메일 매직링크 로그인 영역 */}
      {sent ? (
        <div className="bg-blue-50 rounded-lg p-5 text-[15px] text-blue-600 font-medium leading-[1.6]">
          {email}로 로그인 링크를 보냈습니다.
          <br />
          이메일을 확인해주세요.
        </div>
      ) : (
        <form onSubmit={handleEmailSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
            className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            이메일로 로그인 링크 받기
          </button>
        </form>
      )}
    </main>
  );
}
