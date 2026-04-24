"use client";

// ============================================================
// WithdrawSection — 회원 탈퇴 섹션 (마이페이지 최하단)
// ============================================================
// 실수 방지 위해 2단계 확인:
//   1. 체크박스 "모든 데이터가 영구 삭제됨을 이해했어요" 체크해야 버튼 활성화
//   2. 버튼 클릭 → window.confirm 한 번 더 확인
// 둘 다 통과해야 /api/account/delete 호출.
//
// 성공 시: 홈(/?goodbye=1) 으로 이동 + router.refresh() 로 서버 세션 상태 갱신.
// 실패 시: 에러 메시지 표시 (특히 활성 구독 409 케이스).
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";

export function WithdrawSection() {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    if (!acknowledged) return;

    // window.confirm 은 스타일링 제한이 있지만 비개발자 대상 모바일 호환성 좋음.
    // 커스텀 모달은 Phase 2 개선 항목.
    const confirmed = window.confirm(
      "정말 탈퇴하시겠어요?\n\n탈퇴하시면 프로필·관심 분야·알림 설정·AI 사용 기록 등 모든 데이터가 영구 삭제되며 복구할 수 없어요.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        // 409 = 활성 구독으로 차단 → 별도 이벤트로 분리 (취소→탈퇴 퍼널 추적용)
        if (res.status === 409) {
          trackEvent(EVENTS.ACCOUNT_DELETION_BLOCKED, {
            reason: "active_subscription",
          });
        }
        const data = await res.json().catch(() => ({ error: "실패" }));
        throw new Error(data.error || "탈퇴 처리에 실패했어요.");
      }

      // 탈퇴 완료 이벤트 (router.push 전에 호출 — 페이지 언마운트 후엔 gtag 레이스)
      trackEvent(EVENTS.ACCOUNT_DELETED);

      // 탈퇴 완료 → 홈으로 이동.
      // router.refresh() 로 layout 의 user 상태까지 서버에서 다시 계산 → Nav 의 로그인 버튼 복귀.
      router.push("/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "처리 중 문제가 생겼어요.";
      setError(msg);
      setBusy(false);
    }
    // 성공 시엔 busy 를 풀지 않음 — 화면 이동 중 버튼 재클릭 방지
  }

  return (
    <section className="mt-12 pt-8 border-t border-grey-100">
      <h2 className="text-[17px] font-bold text-grey-900 mb-2">
        회원 탈퇴
      </h2>
      <p className="text-[13px] text-grey-600 mb-4 leading-[1.6]">
        탈퇴하시면 프로필·관심 분야·알림 설정·AI 사용 기록 등 모든 개인 데이터가
        즉시 삭제되며 복구할 수 없어요. 진행 중인 구독이 있다면 먼저{" "}
        <b className="text-grey-900">결제·구독 페이지</b>에서 구독을 취소해
        주세요.
      </p>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red mb-4 leading-[1.5]">
          {error}
        </div>
      )}

      <label className="flex items-start gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          disabled={busy}
          className="mt-1 cursor-pointer"
        />
        <span className="text-[13px] text-grey-700 leading-[1.5]">
          모든 데이터가 영구 삭제되며 복구할 수 없음을 이해했어요.
        </span>
      </label>

      <button
        type="button"
        onClick={handleWithdraw}
        disabled={!acknowledged || busy}
        className="px-4 py-2 text-[13px] font-semibold rounded-md border border-red text-red bg-white hover:bg-red/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {busy ? "처리 중..." : "회원 탈퇴"}
      </button>
    </section>
  );
}
