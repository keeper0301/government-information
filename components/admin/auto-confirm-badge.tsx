"use client";

// ============================================================
// 자동 등록 배지 — 사용자 페이지(welfare/loan detail)에서 admin 만 보이는 배지
// ============================================================
// 배경: /admin 에 별도 detail 라우트가 없어 사용자 detail 페이지에서 admin 만
// 분기로 노출. 일반 사용자는 보지 못함 (server 분기 + 컴포넌트 렌더 0).
// 회수/복원 버튼은 server action 호출 — server action 자체가 requireAdmin
// 가드를 가지므로 UI 분기는 노출 통제만 책임 (defense in depth).
//
// UX 한계 (의도된 동작):
//   회수 직후 같은 user detail 페이지를 새로고침하면 RLS USING(is_hidden=false)
//   때문에 row 가 안 보여 404 가 나타남. 즉 user detail 에서 회수 후 "복원"
//   버튼을 누를 기회가 없음. 사장님이 잘못 회수한 경우 /admin/auto-confirmed
//   대시보드로 가서 복원하면 됨 (그쪽엔 admin client = service_role 우회).
//   여기 "복원" 버튼은 isHidden=true 후보가 (예: /admin/auto-confirmed
//   → 사용자 페이지 직접 진입) 도달했을 때 노출되는 안전망.
// ============================================================

import { useTransition } from "react";
import { revokeAction, restoreAction } from "@/app/admin/auto-confirmed/actions";

export function AutoConfirmBadge({
  candidateId,
  tier,
  isHidden,
  autoConfirmedAt,
}: {
  // candidate id 가 없으면 (수동 등록 정책 등) 배지 노출 X
  candidateId: string | null;
  // 자동 등록 tier — high/mid 만 자동 마킹 (low 는 수동 confirm 큐로 빠짐)
  tier: "high" | "mid" | null;
  // welfare/loan row 의 is_hidden — true 면 회수된 상태
  isHidden: boolean;
  // 자동 등록 시각 — 사장님이 언제 등록됐는지 한눈에 확인
  autoConfirmedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  // candidate 매핑 또는 자동 등록 메타가 없으면 일반 사용자처럼 안 보이게.
  // 수동 등록 정책의 경우 auto_confirm_tier=null 이라 자연 분기됨.
  if (!candidateId || !tier) return null;

  // tier 별 색상 — high(green) 는 신뢰도 높음, mid(amber) 는 검토 권장
  const tierColor =
    tier === "high"
      ? "bg-green-100 text-green-700"
      : "bg-amber-100 text-amber-700";

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-md border ${
        isHidden ? "border-red-200 bg-red-50" : "border-grey-200 bg-grey-50"
      }`}
    >
      <span className={`text-xs px-1.5 py-0.5 rounded ${tierColor}`}>
        🤖 AI {tier}
      </span>
      <span className="text-xs text-grey-700">
        자동 등록{" "}
        {autoConfirmedAt
          ? new Date(autoConfirmedAt).toLocaleString("ko-KR")
          : "—"}
      </span>
      {isHidden ? (
        <>
          <span className="text-xs text-red-600 font-semibold">회수됨</span>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                if (
                  confirm("이 정책을 복원합니다 (사용자에게 다시 노출)?")
                ) {
                  await restoreAction(candidateId);
                }
              })
            }
            disabled={pending}
            className="text-xs text-blue-600 disabled:opacity-50"
          >
            복원
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              if (confirm("이 정책을 회수합니다 (사용자 노출 즉시 차단)?")) {
                await revokeAction(candidateId);
              }
            })
          }
          disabled={pending}
          className="text-xs text-red-600 disabled:opacity-50"
        >
          회수
        </button>
      )}
    </div>
  );
}
