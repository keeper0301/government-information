// ============================================================
// /admin/auto-confirmed — AI 자동 등록된 정책 검수 페이지
// ============================================================
// LLM 신뢰도 high·mid 로 자동 confirm 된 welfare/loan 정책 목록.
// 사장님이 잘못 분류된 사례를 1클릭 회수 + 복원할 수 있는 검수 큐.
// 회수된 row 도 함께 노출 — 잘못 회수했을 때 즉시 복원 가능.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { listAutoConfirmedPolicies } from "@/lib/press-ingest/candidates";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AutoConfirmedList } from "./components";

export const metadata: Metadata = {
  title: "AI 자동 등록 검수 | 어드민",
  robots: { index: false, follow: false },
};

// 자동 등록은 cron 으로 실시간 늘어나므로 항상 최신 데이터 조회
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; revoked?: string }>;
}) {
  // 1) 권한 가드 — 비로그인 → /login, 비관리자 → 홈
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/auto-confirmed");
  if (!isAdminUser(user.email)) redirect("/");

  // 2) 윈도우 필터 — 1·3·7·30 일 만 허용 (정수 clamp)
  const params = await searchParams;
  const days = Math.max(1, Math.min(30, Number(params.days ?? "3")));
  // user detail 페이지에서 회수 직후 redirect 시 query 로 candidate id 전달.
  // 사장님이 "방금 회수" 인지 + 잘못 회수했으면 즉시 복원 가능하게 강조.
  const justRevokedId = typeof params.revoked === "string" ? params.revoked : null;

  // 3) 자동 등록 정책 목록 조회 (회수 포함)
  const rows = await listAutoConfirmedPolicies({ sinceDays: days });

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · AI 자동 등록"
        title="자동 등록 정책 검수"
        description="LLM 신뢰도 high·mid 로 자동 등록된 정책. 잘못된 분류 1클릭 회수 + 복원."
      />
      {justRevokedId && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>회수 완료</strong> — 잘못 회수하셨다면 아래 목록에서 빨간색 처리된 항목을 찾아 &quot;복원&quot; 버튼을 누르세요.
        </div>
      )}
      <AutoConfirmedList rows={rows} days={days} />
    </div>
  );
}
