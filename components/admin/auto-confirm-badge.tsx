"use client";

// ============================================================
// 자동 등록 배지 — 사용자 페이지(welfare/loan detail)에서 admin 만 보이는 배지
// ============================================================
// 배경: /admin 에 별도 detail 라우트가 없어 사용자 detail 페이지에서 admin 만
// 분기로 노출. 일반 사용자는 보지 못함 (server 분기 + 컴포넌트 렌더 0).
// 회수/복원 버튼은 server action 호출 — server action 자체가 requireAdmin
// 가드를 가지므로 UI 분기는 노출 통제만 책임 (defense in depth).
//
// UX 흐름 (Task B 보강):
//   회수 직후 RLS USING(is_hidden=false) 가 row 차단 → 같은 user detail 새로고침
//   시 404. 따라서 회수 성공 후 자동으로 /admin/auto-confirmed 로 redirect 해서
//   사장님이 검수 페이지에서 복원 버튼으로 다시 살릴 수 있게 함.
//   복원 성공 시는 router.refresh() 로 같은 페이지 즉시 갱신.
// ============================================================

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeAction, restoreAction } from "@/app/admin/auto-confirmed/actions";

function formatKstMinute(iso: string | null): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "—";

  const kst = new Date(time + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

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
  const router = useRouter();
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
        자동 등록 {formatKstMinute(autoConfirmedAt)}
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
                  // 같은 페이지 즉시 갱신 — RLS 통과 후 row 다시 보임
                  router.refresh();
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
                // 회수 후 같은 user detail 은 RLS 차단으로 404 — 검수 페이지로 이동.
                // ?revoked=program_id 로 query 전달하면 검수 페이지 banner 가능.
                router.push(`/admin/auto-confirmed?revoked=${candidateId}`);
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
