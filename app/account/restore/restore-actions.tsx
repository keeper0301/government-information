"use client";

// ============================================================
// RestoreActions — 복구 / 즉시 영구 삭제 두 액션 버튼 (클라이언트)
// ============================================================
// 복구: POST /api/account/restore → 성공 시 router.push("/") + refresh()
// 즉시 삭제: 체크박스 + window.confirm 2단계 → POST /api/account/delete { final: true }
//            → 성공 시 홈으로. 서버가 세션 signOut 까지 처리.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackEvent, EVENTS } from "@/lib/analytics";

type Props = {
  // ISO8601 — scheduled 영구 삭제 시각. 클라이언트 측에서 남은 일수 계산에 사용.
  scheduledDeleteAt: string;
};

export function RestoreActions({ scheduledDeleteAt }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"restore" | "final" | "logout" | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingDays, setRemainingDays] = useState<number | null>(null);

  // 남은 유예 일수 — 마운트 후 한 번 계산 (현재 시각 기준, Date.now 는 impure 라 server 불가).
  useEffect(() => {
    const remainingMs = new Date(scheduledDeleteAt).getTime() - Date.now();
    setRemainingDays(Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))));
  }, [scheduledDeleteAt]);

  async function handleRestore() {
    setBusy("restore");
    setError(null);
    try {
      const res = await fetch("/api/account/restore", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "복구 처리에 실패했어요.");
      }
      // not_pending 인 경우도 OK — 홈으로
      trackEvent(EVENTS.ACCOUNT_RESTORED);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "복구 중 문제가 생겼어요.");
      setBusy(null);
    }
  }

  async function handleFinalDelete() {
    if (!acknowledged) return;

    const confirmed = window.confirm(
      "지금 바로 영구 삭제하시겠어요?\n\n유예 기간을 포기하고 즉시 모든 데이터를 삭제합니다. 복구할 수 없어요.",
    );
    if (!confirmed) return;

    setBusy("final");
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "영구 삭제 처리에 실패했어요.");
      }
      trackEvent(EVENTS.ACCOUNT_DELETED, {
        reason: "unspecified",
        has_detail: false,
        finalize_source: "user_immediate",
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 중 문제가 생겼어요.");
      setBusy(null);
    }
  }

  // 이 계정에서 로그아웃만 — 다른 계정으로 로그인하고 싶은 경우. pending 은 유지.
  async function handleLogout() {
    setBusy("logout");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red leading-[1.5]">
          {error}
        </div>
      )}

      {remainingDays !== null && (
        <div className="text-[13px] text-grey-700" role="status" aria-live="polite">
          남은 유예 기간: <b className="text-grey-900">약 {remainingDays}일</b>
        </div>
      )}

      <button
        type="button"
        onClick={handleRestore}
        disabled={busy !== null}
        className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {busy === "restore" ? "복구 중..." : "계정 복구하기"}
      </button>

      {/* 즉시 영구 삭제 — 체크박스 + confirm 2단계 */}
      <div className="pt-4 border-t border-grey-100">
        <p className="text-[13px] text-grey-700 mb-3 leading-[1.6]">
          유예 없이 지금 영구 삭제를 원하시는 경우:
        </p>
        <label className="flex items-start gap-2 mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={busy !== null}
            className="mt-1 cursor-pointer"
          />
          <span className="text-[13px] text-grey-700 leading-[1.5]">
            모든 데이터가 즉시 영구 삭제되며 복구할 수 없음을 이해했어요.
          </span>
        </label>
        <button
          type="button"
          onClick={handleFinalDelete}
          disabled={!acknowledged || busy !== null}
          className="px-4 py-2 text-[13px] font-semibold rounded-md border border-red text-red bg-white hover:bg-red/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy === "final" ? "처리 중..." : "지금 영구 삭제"}
        </button>
      </div>

      {/* 로그아웃 — 다른 계정으로 이용하고 싶은 경우 pending 유지한 채 세션만 종료 */}
      <div className="pt-4 border-t border-grey-100">
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy !== null}
          className="text-[13px] text-grey-600 underline hover:text-grey-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy === "logout"
            ? "로그아웃 중..."
            : "이 계정에서 로그아웃만 하기"}
        </button>
      </div>
    </div>
  );
}
