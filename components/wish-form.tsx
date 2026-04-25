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
      <div className="bg-white rounded-3xl shadow-md ring-1 ring-grey-100 p-8 max-md:p-6 text-center">
        <div className="text-[40px] mb-3" aria-hidden="true">💌</div>
        <h3 className="text-[20px] font-extrabold text-grey-900 tracking-[-0.5px] mb-2">
          의견 보내주셔서 감사해요
        </h3>
        <p className="text-[14px] text-grey-600 leading-[1.6]">
          사장님이 직접 읽고 서비스 개선에 반영합니다.
          <br />
          더 알려주실 게 있으면 언제든 한 번 더 보내주세요.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setWish("");
            setEmail("");
            setSubmitting(false);
          }}
          className="mt-5 h-10 px-5 rounded-xl bg-grey-100 hover:bg-grey-200 text-grey-700 font-semibold text-[14px] transition-colors border-0 cursor-pointer"
        >
          한 번 더 보내기
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-3xl shadow-md ring-1 ring-grey-100 p-8 max-md:p-6"
    >
      <div className="mb-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-blue-500 tracking-[0.18em]">
          한 마디
        </span>
      </div>
      <h3 className="text-[22px] max-md:text-[18px] font-extrabold text-grey-900 tracking-[-0.5px] mb-2 leading-[1.3]">
        당신이 가장 받고 싶은 정부 혜택은?
      </h3>
      <p className="text-[14px] text-grey-600 leading-[1.6] mb-5">
        한 줄도 좋아요. "이런 정보가 keepioo 에 있으면 좋겠다" — 사장님이 직접 읽고 다음 업데이트에 반영합니다.
      </p>

      {/* sr-only label — 스크린리더 접근성 (시각적으로는 숨김, 보조 기술은 읽음) */}
      <label htmlFor="wish-textarea" className="sr-only">
        받고 싶은 정부 혜택 의견
      </label>
      <textarea
        id="wish-textarea"
        value={wish}
        onChange={(e) => setWish(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="예: 1인 자영업자가 받을 수 있는 임대료 지원, 노년층 의료비 지원 정보…"
        className="w-full rounded-2xl border-[1.5px] border-grey-200 px-4 py-3 text-[15px] text-grey-900 placeholder:text-grey-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(49,130,246,0.16)] transition-all resize-none"
      />

      <div className="flex items-center justify-between mt-2 mb-4 text-[12px] text-grey-500">
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
        placeholder="이메일 (선택 — 답장 받고 싶으실 때만)"
        className="w-full rounded-2xl border-[1.5px] border-grey-200 px-4 py-2.5 text-[14px] text-grey-900 placeholder:text-grey-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(49,130,246,0.16)] transition-all mb-4"
      />

      {error && (
        <p className="text-[13px] text-red font-medium mb-3" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full h-12 rounded-2xl text-[15px] font-bold transition-all border-0 cursor-pointer ${
          canSubmit
            ? "bg-blue-500 text-white hover:bg-blue-600 shadow-blue-glow active:scale-[0.98]"
            : "bg-grey-100 text-grey-500 cursor-not-allowed"
        }`}
      >
        {submitting ? "보내는 중..." : "보내기"}
      </button>
    </form>
  );
}
