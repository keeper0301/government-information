"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";

// 비밀번호 재설정 메일 링크 → /auth/callback?type=recovery → 여기로 도착
// 이 시점에 Supabase 가 임시 세션을 만들어둔 상태이고
// updateUser({ password }) 를 호출하면 새 비밀번호로 저장됨
//
// 직접 URL 로 진입한 경우(세션 없음)에는 메일 링크 없이 진입한 것이라
// /forgot-password 로 돌려보냄
export default function ResetPasswordPage() {
  const router = useRouter();
  // 세션 확인 단계 표시 (확인 끝나기 전엔 폼을 안 보여줌)
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  // 입력값
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 진입 시 세션 존재 여부 확인 — recovery 토큰으로 임시 세션이 생성되었어야 함
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasSession(true);
        setChecking(false);
      } else {
        // 세션 없으면 정상적인 진입이 아님 → 재설정 요청 페이지로 보냄
        router.replace("/forgot-password");
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // 클라이언트 검증 (UX용)
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
    // 새 비밀번호 저장 — Supabase 가 현재 세션의 사용자 비번을 갱신함
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(translateAuthError(updateError.message));
      setSubmitting(false);
      return;
    }

    // 성공 — 보안을 위해 모든 기기의 세션을 끊고 새 비번으로 다시 로그인하게 함
    // scope: 'global' 옵션으로 다른 디바이스/브라우저의 로그인 상태도 무효화
    // (비밀번호 분실 재설정의 핵심 의도 — 공격자가 세션 갖고 있어도 끊김)
    await supabase.auth.signOut({ scope: "global" });
    router.push("/login?reset=success");
  }

  // 세션 확인 중 — 깜빡임 대신 안내 문구 한 줄
  if (checking) {
    return (
      <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto text-center text-[14px] text-grey-600">
        확인 중...
      </main>
    );
  }

  // 세션 없음 — 위 useEffect 가 이미 리다이렉트 시킴 (이동 직전 안전장치)
  if (!hasSession) {
    return <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto" />;
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        새 비밀번호 설정
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        앞으로 사용할 새 비밀번호를 입력해주세요.
      </p>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-4 text-sm text-red leading-[1.5]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="새 비밀번호 확인"
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
          {submitting ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </main>
  );
}
