"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
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
        이메일을 입력하면 로그인 링크를 보내드립니다.
      </p>

      {sent ? (
        <div className="bg-blue-50 rounded-lg p-5 text-[15px] text-blue-600 font-medium leading-[1.6]">
          {email}로 로그인 링크를 보냈습니다.
          <br />
          이메일을 확인해주세요.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
            className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
          />
          {error && (
            <p className="text-sm text-red mb-3">{error}</p>
          )}
          <button
            type="submit"
            className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors"
          >
            로그인 링크 받기
          </button>
        </form>
      )}
    </main>
  );
}
