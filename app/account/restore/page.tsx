// ============================================================
// /account/restore — 30일 유예 복구 안내 페이지
// ============================================================
// pending_deletions 에 row 있는 사용자 전용.
// - 예정 삭제 시각 안내 (scheduled_delete_at)
// - 복구 / 지금 영구 삭제 두 액션
//
// 접근 흐름:
//   1) 탈퇴 요청한 사용자가 다시 로그인 시도
//   2) middleware 가 pending 감지 → 이 페이지로 리다이렉트
//   3) 사용자가 복구 or 즉시 삭제 선택
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RestoreActions } from "./restore-actions";

export const metadata: Metadata = {
  title: "계정 복구 — 정책알리미",
  description: "탈퇴 요청한 계정의 복구 또는 영구 삭제를 선택할 수 있습니다.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatKST(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RestorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/restore");

  // RLS 로 본인 row 만 SELECT 허용 — 별도 권한 체크 불필요
  const { data: pending } = await supabase
    .from("pending_deletions")
    .select("email, requested_at, scheduled_delete_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // pending 아니면 복구 페이지 볼 이유 없음 → 홈으로
  if (!pending) redirect("/");

  const requestedAtLabel = formatKST(pending.requested_at);
  const scheduledLabel = formatKST(pending.scheduled_delete_at);

  // 남은 유예 일수는 현재 시각 기준이라 impure → client 측 RestoreActions 에서
  // 렌더 시점에 계산·표시. 여기 server 에선 정적인 요청/예정 시각만 노출.

  return (
    <main className="pt-28 pb-20 px-10 max-w-[560px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        탈퇴 요청 확인
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.65] mb-6">
        <b className="text-grey-900">{pending.email}</b> 계정으로 탈퇴를 요청하셨어요.
        유예 기간 동안은 로그인 대신 이 화면이 먼저 표시돼요.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
        <div className="text-[14px] text-amber-900 leading-[1.7]">
          <div className="mb-1">
            탈퇴 요청: <b>{requestedAtLabel}</b>
          </div>
          <div>
            예정 영구 삭제: <b>{scheduledLabel}</b>
          </div>
        </div>
      </div>

      <p className="text-[14px] text-grey-700 leading-[1.7] mb-6">
        이 기간 안에 <b>복구</b>하시면 계정이 즉시 돌아와요. 복구 없이 기간이
        지나면 모든 개인 데이터가 영구 삭제되며 되돌릴 수 없어요.
      </p>

      <RestoreActions scheduledDeleteAt={pending.scheduled_delete_at} />

      <p className="mt-10 text-[13px] text-grey-600 leading-[1.6]">
        문의가 필요하시면{" "}
        <a
          href="mailto:keeper0301@gmail.com"
          className="text-grey-700 underline hover:text-grey-900"
        >
          keeper0301@gmail.com
        </a>
        으로 연락 주세요.
      </p>
    </main>
  );
}
