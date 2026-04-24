"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { trackEvent, EVENTS } from "@/lib/analytics";

// 회원가입 페이지 (이메일 + 비밀번호 방식)
// - 가입 후에는 Supabase가 확인 메일을 보냄
// - 사용자가 메일의 링크를 클릭해야 비로소 로그인 가능 상태가 됨
// - 가입 직후엔 /signup/sent 안내 페이지로 이동
// 동의 흐름:
//   - 약관·개인정보처리방침 필수 (체크해야 버튼 활성화)
//   - 마케팅 선택 (체크 시 user_metadata.marketing_consent=true 로 넘어감)
//   - 실제 consent_log 기록은 콜백에서 신규 사용자 판정 후 자동
export default function SignupPage() {
  const router = useRouter();
  // 입력값 3종 (이메일, 비밀번호, 비밀번호 확인)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // 동의 체크박스 — 약관·방침은 필수, 마케팅은 선택
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  // 폼 제출 중인지 (중복 클릭 방지)
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 전체 동의 체크박스 상태 계산 + 토글
  const allChecked = agreeTerms && agreePrivacy && agreeMarketing;
  function toggleAll() {
    const next = !allChecked;
    setAgreeTerms(next);
    setAgreePrivacy(next);
    setAgreeMarketing(next);
  }

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
    // 필수 동의 확인
    if (!agreeTerms || !agreePrivacy) {
      setError("이용약관과 개인정보처리방침에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    // 가입 요청 — 확인 메일의 링크를 클릭하면 /auth/callback?next=/ 로 돌아옴
    // options.data 는 user.user_metadata 로 저장됨 → 콜백에서 마케팅 동의 여부 판정
    const callbackUrl = `${window.location.origin}/auth/callback?next=/`;
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl,
        data: { marketing_consent: agreeMarketing },
      },
    });

    if (signUpError) {
      setError(translateAuthError(signUpError.message));
      setSubmitting(false);
      return;
    }

    // 가입 요청(메일 발송) 성공 — router.push 전에 호출해 unmount 레이스 방지.
    // signup_completed (callback) 와 함께 "가입 시도 → 메일 확인" drop-off 퍼널 분석.
    // had_marketing_consent 로 "마케팅 동의 사용자가 메일 확인율 높은가" 세그먼트 가능.
    trackEvent(EVENTS.SIGNUP_INITIATED, {
      method: "email",
      had_marketing_consent: agreeMarketing,
    });

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

        {/* 동의 섹션 */}
        <div className="bg-grey-50 border border-grey-100 rounded-lg p-4 mb-4">
          {/* 전체 동의 */}
          <label className="flex items-center gap-2.5 pb-3 border-b border-grey-200 cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-[18px] h-[18px] accent-blue-500 cursor-pointer"
            />
            <span className="text-[15px] font-semibold text-grey-900">
              전체 동의
            </span>
          </label>

          {/* 개별 동의 */}
          <div className="pt-3 space-y-2.5">
            <ConsentCheckbox
              checked={agreeTerms}
              onChange={setAgreeTerms}
              label="이용약관 동의"
              required
              linkHref="/terms"
            />
            <ConsentCheckbox
              checked={agreePrivacy}
              onChange={setAgreePrivacy}
              label="개인정보처리방침 동의"
              required
              linkHref="/privacy"
            />
            <ConsentCheckbox
              checked={agreeMarketing}
              onChange={setAgreeMarketing}
              label="마케팅 정보 수신 (이메일·카카오톡으로 혜택·이벤트 안내)"
              required={false}
            />
          </div>
        </div>

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

// 개별 동의 체크박스 — 텍스트 + (선택) 전문 보기 링크
function ConsentCheckbox({
  checked,
  onChange,
  label,
  required,
  linkHref,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  required: boolean;
  linkHref?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2.5 cursor-pointer flex-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-[16px] h-[16px] accent-blue-500 cursor-pointer"
        />
        <span className="text-[13px] text-grey-700">
          <span
            className={
              required ? "text-red font-semibold mr-1" : "text-grey-600 mr-1"
            }
          >
            {required ? "[필수]" : "[선택]"}
          </span>
          {label}
        </span>
      </label>
      {linkHref && (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-grey-600 no-underline hover:text-grey-700 underline"
        >
          보기
        </a>
      )}
    </div>
  );
}
