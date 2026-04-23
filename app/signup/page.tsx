"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";

// 회원가입 페이지 (이메일 + 비밀번호 방식)
// - 가입 후에는 Supabase가 확인 메일을 보냄
// - 사용자가 메일의 링크를 클릭해야 비로소 로그인 가능 상태가 됨
// - 가입 직후엔 /signup/sent 안내 페이지로 이동
export default function SignupPage() {
  const router = useRouter();
  // 입력값 3종 (이메일, 비밀번호, 비밀번호 확인)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // 폼 제출 중인지 (중복 클릭 방지)
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // 클라이언트 검증 (UX용 — 진짜 강제는 Supabase 서버에서)
    if (password.length < 8) {
      setError(translateAuthError("password should be at least"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(translateAuthError("passwords do not match"));
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    // 가입 요청 — 확인 메일의 링크를 클릭하면 /auth/callback?next=/ 로 돌아옴
    const callbackUrl = `${window.location.origin}/auth/callback?next=/`;
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl },
    });

    if (signUpError) {
      setError(translateAuthError(signUpError.message));
      setSubmitting(false);
      return;
    }

    // 성공 — 안내 페이지로 이동 (이메일을 쿼리로 넘겨서 표시)
    router.push(`/signup/sent?email=${encodeURIComponent(email)}`);
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        회원가입
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        이메일과 비밀번호로 가입해보세요.
        <br />
        가입 후 확인 메일을 보내드려요.
      </p>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-4 text-sm text-red leading-[1.5]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 이메일 입력 */}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소"
          required
          autoComplete="email"
          className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
        />
        {/* 비밀번호 입력 (autocomplete=new-password 로 자동완성에 새 비번임을 알림) */}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
        />
        {/* 비밀번호 확인 입력 */}
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="비밀번호 확인"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-4"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {submitting ? "가입 중..." : "회원가입"}
        </button>
      </form>

      {/* 이미 가입한 사용자를 위한 로그인 링크 */}
      <p className="mt-6 text-center text-[14px] text-grey-600">
        이미 계정이 있으신가요?{" "}
        <a
          href="/login"
          className="text-blue-500 font-semibold no-underline hover:underline"
        >
          로그인
        </a>
      </p>
    </main>
  );
}
