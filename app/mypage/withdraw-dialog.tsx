"use client";

// WithdrawDialog — "탈퇴 진행하기" 버튼 + 클릭 시 열리는 모달.
// 모달 안에 사유 라디오 / 기타 입력 / 30일 안내 / 체크박스 / 최종 확인.
// 기존 withdraw-section.tsx 의 fetch / GA4 / 에러 처리 흐름 그대로 이전.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// 사유 옵션 — value 는 GA4 Custom Dimension 안정성을 위해 snake_case 고정.
// 라벨 문구는 자유롭게 바꿔도 value 는 건드리지 말 것 (지표 히스토리 연속성).
const WITHDRAW_REASONS: { value: string; label: string }[] = [
  { value: "no_content", label: "찾는 공고·정보가 부족해요" },
  { value: "alert_fatigue", label: "알림이 너무 많거나 도움이 안 됐어요" },
  { value: "other_service", label: "다른 서비스를 이용 중이에요" },
  { value: "complexity", label: "사용하기 복잡해요" },
  { value: "privacy", label: "개인정보가 걱정돼요" },
  { value: "etc", label: "기타" },
];

const DETAIL_MAX = 200;

export function WithdrawDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // busy 동안에는 모달 닫힘 방지 (진행 중 fetch 보호)
  function handleOpenChange(next: boolean) {
    if (busy && !next) return;
    setOpen(next);
    if (!next) {
      // 닫힐 때 폼 상태 초기화 — 다음 진입 시 깨끗하게
      setReason("");
      setReasonDetail("");
      setAcknowledged(false);
      setError(null);
    }
  }

  async function handleWithdraw() {
    if (!acknowledged) return;
    setBusy(true);
    setError(null);

    // '기타' 후 다른 사유로 바꾼 경우 reasonDetail 잔재 정리
    const effectiveDetail = reason === "etc" ? reasonDetail.trim() : "";

    try {
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

      // 탈퇴 '요청' 이벤트 — 최종 삭제 아님. 최종은 cron / 즉시 삭제에서 별도 ACCOUNT_DELETED 집계.
      trackEvent(EVENTS.ACCOUNT_DELETE_REQUESTED, {
        reason: reason || "unspecified",
        has_detail: !!effectiveDetail,
        grace_days: 30,
      });

      router.push("/");
      router.refresh();
      // 성공 시엔 busy 를 풀지 않음 — 화면 이동 중 재클릭 방지
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "처리 중 문제가 생겼어요.";
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className="bg-red text-white hover:bg-red/90"
        >
          탈퇴 진행하기
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>회원 탈퇴</DialogTitle>
          <DialogDescription className="leading-[1.6] pt-1">
            요청 후 <b className="text-grey-900">30일간 유예</b>돼요. 이 기간 안에 같은 이메일로 다시 로그인하면 바로 복구할 수 있어요.
            30일이 지나면 프로필·관심 분야·알림 설정·AI 사용 기록 등 모든 개인 데이터가 영구 삭제됩니다.
            진행 중인 구독이 있다면 먼저 결제·구독 페이지에서 취소해 주세요.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red leading-[1.5]">
            {error}
          </div>
        )}

        {/* 사유 라디오 (선택) */}
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-grey-900 mb-1">
            떠나시는 이유{" "}
            <span className="font-normal text-grey-600">(선택)</span>
          </legend>
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

          {/* '기타' 선택 시에만 자유 입력 노출 — 질문 피로 방지 */}
          {reason === "etc" && (
            <div className="mt-2">
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
              <div className="text-[12px] text-grey-600 text-right mt-1">
                {reasonDetail.length} / {DETAIL_MAX}
              </div>
            </div>
          )}
        </fieldset>

        {/* 영구 삭제 이해 체크박스 — "탈퇴 확정" 버튼 활성화 게이트 */}
        <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={busy}
            className="mt-1 cursor-pointer"
          />
          <span className="text-[13px] text-grey-700 leading-[1.5]">
            30일 유예 후 모든 데이터가 영구 삭제됨을 이해했어요
            (유예 기간 내 복구 가능).
          </span>
        </label>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleWithdraw}
            disabled={!acknowledged || busy}
            className="bg-red text-white hover:bg-red/90"
          >
            {busy ? "처리 중..." : "탈퇴 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
