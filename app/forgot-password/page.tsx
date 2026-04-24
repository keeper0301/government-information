"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError, classifyAuthError } from "@/lib/auth-errors";
import { trackEvent, EVENTS } from "@/lib/analytics";

// 비밀번호를 잊은 사용자를 위한 페이지
// - 이메일을 입력 받아 Supabase 가 재설정 링크를 메일로 보냄
// - 메일의 링크를 클릭하면 /auth/callback?type=recovery 로 돌아오고
//   콜백이 /reset-password 로 보내서 새 비번을 설정함
//
// 보안: 이메일 존재 여부를 노출하지 않기 위해 항상 동일한 성공 메시지를 보여줌
// (실제 메일은 가입된 이메일에만 발송됨)
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 발송 시도 후 항상 동일한 안내를 보여주기 위한 플래그 (성공/실패 무관)
  const [sent, setSent] = useState(false);
  // 시스템 에러 (네트워크 끊김 같은 진짜 문제) 만 표시
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const supabase = createClient();
    // 메일 링크 클릭 시 돌아올 URL — type=recovery 로 콜백이 분기 처리함
    const callbackUrl = `${window.location.origin}/auth/callback?type=recovery`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: callbackUrl }
    );

    setSubmitting(false);

    // 네트워크 같은 실제 시스템 에러만 사용자에게 표시
    // (이메일 미존재 등은 Supabase 가 200 으로 처리하므로 보통 여기 안 들어옴)
    if (resetError && /network|failed to fetch/i.test(resetError.message)) {
      setError(translateAuthError(resetError.message));
      trackEvent(EVENTS.PASSWORD_RESET_FAILED, {
        reason: classifyAuthError(resetError.message),
        stage: "request",
      });
      return;
    }

    // 그 외엔 항상 동일 안내 (이메일 존재 여부 노출 방지).
    // 이벤트도 발송 — 실제 메일 발송 여부와 무관하게 "요청 클릭" 퍼널 지표.
    trackEvent(EVENTS.PASSWORD_RESET_REQUESTED);
    setSent(true);
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        비밀번호 재설정
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        가입한 이메일을 입력하시면
        <br />
        비밀번호를 새로 설정할 수 있는 링크를 보내드려요.
      </p>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-4 text-sm text-red leading-[1.5]">
          {error}
        </div>
      )}

      {sent ? (
        // 발송 완료 안내 (이메일 존재 여부와 관계없이 동일 메시지)
        <div className="bg-blue-50 rounded-lg p-5 text-[15px] text-blue-600 leading-[1.6]">
          입력하신 이메일로 재설정 링크를 보냈어요.
          <br />
          받은 편지함을 확인해주세요. (스팸함도요)
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
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
            disabled={submitting}
            className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "전송 중..." : "재설정 링크 받기"}
          </button>
        </form>
      )}

      {/* 로그인 페이지로 돌아가기 */}
      <a
        href="/login"
        className="block w-full text-center mt-6 text-[14px] text-grey-600 no-underline hover:text-grey-900"
      >
        로그인 페이지로 돌아가기
      </a>
    </main>
  );
}
