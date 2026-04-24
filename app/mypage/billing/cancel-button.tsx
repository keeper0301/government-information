"use client";

// ============================================================
// CancelButton — 구독 해지 클라이언트 버튼
// ============================================================
// "구독 해지" 클릭 → 확인 → POST /api/billing/cancel → 페이지 새로고침
// 토스 dialog 가 아니라 페이지 인라인 확인 모달로 처리 (UX 안전)
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({ tierName }: { tierName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "해지에 실패했습니다.");
      }
      // 성공: 페이지 새로고침해서 새 상태 표시
      router.refresh();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "해지에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  // 1단계: 일반 버튼
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-[48px] flex items-center justify-center text-[14px] font-semibold rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
      >
        구독 해지
      </button>
    );
  }

  // 2단계: 확인 박스 (인라인)
  return (
    <div className="col-span-2 bg-red-50 border border-red-200 rounded-xl p-4">
      <p className="text-[14px] font-semibold text-grey-900 mb-1">
        정말 {tierName} 구독을 해지할까요?
      </p>
      <p className="text-[13px] text-grey-700 mb-3 leading-[1.5]">
        남은 기간 동안은 계속 사용할 수 있고, 다음 결제부터 청구되지 않아요.
      </p>
      {error && (
        <p className="text-[13px] text-red-700 mb-2">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); }}
          disabled={submitting}
          className="flex-1 min-h-[44px] text-[14px] font-medium rounded-lg bg-white border border-grey-200 text-grey-700 hover:bg-grey-50 cursor-pointer disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="flex-1 min-h-[44px] text-[14px] font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 cursor-pointer disabled:opacity-50"
        >
          {submitting ? "처리 중..." : "해지하기"}
        </button>
      </div>
    </div>
  );
}
