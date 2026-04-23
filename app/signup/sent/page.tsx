"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";

// 회원가입 직후 사용자가 보는 안내 페이지
// - "확인 메일을 보냈어요" 라고 알려주고
// - 메일이 안 오면 다시 보낼 수 있는 버튼 제공
// - 로그인 페이지로 가는 링크 제공
//
// 쿼리 파라미터로 ?email=xxx 가 들어옴 (이전 페이지에서 넘겨줌)
// 직접 URL 입력으로 들어와 이메일이 없으면 /signup 으로 보냄 (사용자 혼란 방지)
export default function SignupSentPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  // 다시 보내기 버튼 상태 (전송 중 / 전송 완료 / 에러)
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  // URL 에서 이메일 읽기. 없으면 가입 페이지로 돌려보냄
  // (이메일 없는 안내 페이지는 보일 이유가 없음 — 다시보내기 버튼도 못 씀)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e) {
      setEmail(e);
    } else {
      router.replace("/signup");
    }
  }, [router]);

  // 확인 메일 다시 보내기
  // - Supabase 의 resend API: type='signup' 으로 가입 확인 메일을 재발송
  // - 이메일이 없으면 (직접 진입한 경우) 버튼이 비활성화되므로 호출되지 않음
  async function handleResend() {
    if (!email) return;
    setError("");
    setResending(true);
    const supabase = createClient();
    const callbackUrl = `${window.location.origin}/auth/callback?next=/`;
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    if (resendError) {
      setError(translateAuthError(resendError.message));
    } else {
      setResent(true);
    }
    setResending(false);
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        확인 메일을 보냈어요
      </h1>

      {/* 메일 전송 성공 안내 — 이메일 강조 */}
      <div className="bg-blue-50 rounded-lg p-5 text-[15px] text-blue-600 leading-[1.6] mb-6">
        {email ? (
          <>
            <strong className="font-semibold">{email}</strong>
            <br />
            받은 편지함에서 확인 링크를 클릭해주세요.
          </>
        ) : (
          <>받은 편지함에서 확인 링크를 클릭해주세요.</>
        )}
      </div>

      {/* 안내 — 메일이 안 오면? */}
      <p className="text-[14px] text-grey-600 leading-[1.6] mb-4">
        메일이 보이지 않으면 스팸함도 확인해주세요. 그래도 없으면 아래 버튼으로
        다시 보낼 수 있어요.
      </p>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-4 text-sm text-red leading-[1.5]">
          {error}
        </div>
      )}

      {/* 다시 보내기 — 한 번 보내면 "보냈어요" 로 변경 */}
      <button
        type="button"
        onClick={handleResend}
        disabled={!email || resending || resent}
        className="w-full py-3 bg-grey-100 text-grey-700 border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-grey-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-3"
      >
        {resent ? "다시 보냈어요" : resending ? "전송 중..." : "확인 메일 다시 보내기"}
      </button>

      {/* 로그인 페이지로 돌아가기 */}
      <a
        href="/login"
        className="block w-full text-center py-3 text-[14px] text-grey-600 no-underline hover:text-grey-900"
      >
        로그인 페이지로 돌아가기
      </a>
    </main>
  );
}
