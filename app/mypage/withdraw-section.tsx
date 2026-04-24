"use client";

// ============================================================
// WithdrawSection — 회원 탈퇴 섹션 (마이페이지 최하단)
// ============================================================
// 실수 방지 + 사유 수집 (선택):
//   1. 떠나는 사유 라디오 (선택, 제품 개선 시그널)
//   2. "기타" 선택 시 자유 입력 텍스트 (선택, 200자)
//   3. 체크박스 "모든 데이터가 영구 삭제됨을 이해했어요"
//   4. 버튼 클릭 → window.confirm 한 번 더 확인
// 체크박스·confirm 둘 다 통과해야 /api/account/delete 호출.
//
// 사유는 GA4 ACCOUNT_DELETED 이벤트의 파라미터로만 전송 (reason·has_detail).
// 본문 DB 저장은 Phase 2 다음 단계 (admin_actions.self_deleted) 에서.
//
// 성공 시: 홈(/) 으로 이동 + router.refresh().
// 실패 시: 에러 메시지 표시 (특히 활성 구독 409).
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";

// 사유 옵션 — value 는 GA4 Custom Dimension 으로 안정적 집계되도록 snake_case 로 고정.
// 라벨 문구는 UX 필요에 따라 바꿔도 value 는 건드리지 말 것 (지표 히스토리 연속성).
const WITHDRAW_REASONS: { value: string; label: string }[] = [
  { value: "no_content", label: "찾는 공고·정보가 부족해요" },
  { value: "alert_fatigue", label: "알림이 너무 많거나 도움이 안 됐어요" },
  { value: "other_service", label: "다른 서비스를 이용 중이에요" },
  { value: "complexity", label: "사용하기 복잡해요" },
  { value: "privacy", label: "개인정보가 걱정돼요" },
  { value: "etc", label: "기타" },
];

const DETAIL_MAX = 200;

export function WithdrawSection() {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    if (!acknowledged) return;

    // window.confirm 은 스타일링 제한 있지만 비개발자·모바일 호환성 좋음.
    const confirmed = window.confirm(
      "정말 탈퇴하시겠어요?\n\n탈퇴하시면 프로필·관심 분야·알림 설정·AI 사용 기록 등 모든 데이터가 영구 삭제되며 복구할 수 없어요.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);

    // 사용자가 '기타' 로 입력 후 다른 사유로 바꾼 경우 reasonDetail state 가
    // 남아있을 수 있음 → 전송 시점에 reason='etc' 조건과 묶어 일관성 보장.
    const effectiveDetail =
      reason === "etc" ? reasonDetail.trim() : "";

    try {
      // 사유는 서버에 body 로 같이 보냄 — 추후 admin_actions 감사 로그에 쓰기 위해
      // 서버 사이드도 수신만 해두고, 이번 단계에선 저장 없이 GA4 로만 집계.
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason || null,
          reason_detail: effectiveDetail || null,
        }),
      });
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

      // 탈퇴 완료 이벤트 — 사유 파라미터 포함. router.push 전에 호출
      // (페이지 언마운트 후엔 gtag 레이스 가능).
      // value 가 고정 사전이라 GA4 Custom Dimension 에 안전하게 enum 처리 가능.
      trackEvent(EVENTS.ACCOUNT_DELETED, {
        reason: reason || "unspecified",
        has_detail: !!effectiveDetail,
      });

      router.push("/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "처리 중 문제가 생겼어요.";
      setError(msg);
      setBusy(false);
    }
    // 성공 시엔 busy 를 풀지 않음 — 화면 이동 중 재클릭 방지
  }

  return (
    <section className="mt-12 pt-8 border-t border-grey-100">
      <h2 className="text-[17px] font-bold text-grey-900 mb-2">회원 탈퇴</h2>
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

      {/* 떠나는 사유 (선택) — 개선 시그널 확보용. 건너뛰어도 탈퇴 가능 */}
      <fieldset className="mb-5">
        <legend className="text-[14px] font-semibold text-grey-900 mb-1">
          떠나시는 이유를 알려주시겠어요?{" "}
          <span className="text-grey-600 font-normal">(선택)</span>
        </legend>
        <p className="text-[13px] text-grey-600 mb-3 leading-[1.5]">
          서비스 개선에 큰 도움이 돼요. 건너뛰셔도 괜찮아요.
        </p>
        <div className="flex flex-col gap-2">
          {WITHDRAW_REASONS.map((r) => (
            <label
              key={r.value}
              className="flex items-start gap-2 cursor-pointer select-none text-[13px] text-grey-800 leading-[1.5]"
            >
              <input
                type="radio"
                name="withdraw-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                className="mt-1 cursor-pointer"
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>

        {/* '기타' 선택 시에만 자유 입력 노출 — 지나친 질문 피로 방지 */}
        {reason === "etc" && (
          <div className="mt-3">
            <textarea
              value={reasonDetail}
              onChange={(e) =>
                setReasonDetail(e.target.value.slice(0, DETAIL_MAX))
              }
              disabled={busy}
              maxLength={DETAIL_MAX}
              rows={3}
              placeholder="불편했던 점이나 바라는 점을 자유롭게 적어주세요."
              className="w-full px-3 py-2 text-[13px] border border-grey-200 rounded-lg outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 leading-[1.5] resize-none"
            />
            <div className="text-[11px] text-grey-600 text-right mt-1">
              {reasonDetail.length} / {DETAIL_MAX}
            </div>
          </div>
        )}
      </fieldset>

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
