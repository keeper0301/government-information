"use client";

import { useState } from "react";

// ============================================================
// WishForm — "당신이 가장 받고 싶은 정책은?" 의견 수집
// ============================================================
// 토스 "금융이 불편한 순간" 패턴. 비로그인 anon 도 작성 가능.
// 짧은 1단 textarea + 선택 이메일 + 제출 버튼. 제출 후 감사 메시지.
// ============================================================

export function WishForm() {
  const [wish, setWish] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = wish.length;
  const canSubmit = charCount >= 5 && charCount <= 500 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wish, email: email || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "제출에 실패했어요.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했어요.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
        <div className="text-[28px] mb-2" aria-hidden="true">💌</div>
        <h3 className="text-[15px] font-extrabold text-grey-900 tracking-[-0.3px] mb-1">
          감사해요!
        </h3>
        <p className="text-[12px] text-grey-600 leading-[1.5]">
          사장님이 직접 읽고 반영합니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setWish("");
            setEmail("");
            setSubmitting(false);
          }}
          className="mt-3 h-8 px-3 rounded-lg bg-grey-50 hover:bg-grey-100 text-grey-700 font-semibold text-[12px] transition-colors border-0 cursor-pointer"
        >
          한 번 더
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm p-5"
    >
      <div className="mb-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-500 tracking-[0.15em]">
          💌 한 마디
        </span>
      </div>
      <h3 className="text-[15px] font-extrabold text-grey-900 tracking-[-0.3px] mb-3 leading-[1.4]">
        받고 싶은 혜택, 알려주세요
      </h3>

      {/* sr-only label — 스크린리더 접근성 */}
      <label htmlFor="wish-textarea" className="sr-only">
        받고 싶은 정부 혜택 의견
      </label>
      <textarea
        id="wish-textarea"
        value={wish}
        onChange={(e) => setWish(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="예: 1인 자영업자 임대료 지원…"
        className="w-full rounded-xl border-[1.5px] border-grey-200 px-3 py-2 text-[13px] text-grey-900 placeholder:text-grey-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.16)] transition-all resize-none"
      />

      <div className="flex items-center justify-between mt-1 mb-2 text-[11px] text-grey-500">
        <span className={charCount > 500 ? "text-red font-semibold" : ""}>
          {charCount}/500
        </span>
        <span className="text-grey-400">최소 5자</span>
      </div>

      <label htmlFor="wish-email" className="sr-only">
        이메일 (선택)
      </label>
      <input
        id="wish-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        maxLength={200}
        placeholder="이메일 (답장 받을 때만)"
        className="w-full rounded-xl border-[1.5px] border-grey-200 px-3 py-2 text-[12px] text-grey-900 placeholder:text-grey-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.16)] transition-all mb-2"
      />

      {error && (
        <p className="text-[11px] text-red font-medium mb-2" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full h-10 rounded-xl text-[13px] font-bold transition-all border-0 cursor-pointer ${
          canSubmit
            ? "bg-blue-500 text-white hover:bg-blue-600 shadow-blue-glow active:scale-[0.98]"
            : "bg-grey-50 text-grey-500 cursor-not-allowed"
        }`}
      >
        {submitting ? "보내는 중..." : "보내기"}
      </button>
    </form>
  );
}
