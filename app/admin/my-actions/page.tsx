// ============================================================
// /admin/my-actions — 내가 수행한 관리 작업 회고
// ============================================================
// 사장님 본인(actor) 관점에서 감사 로그 조회.
// "내가 언제 누구에게 뭘 했지?" 회고용. 최근 50건 고정.
//
// 대상 사용자 컬럼:
//   - target_user_id 가 살아있으면 /admin/users/{id} 로 링크
//   - NULL (이미 탈퇴) 이면 details.email 로 식별 (manual_delete_user 시 저장됨)
//
// 권한:
//   - 비로그인 → /login
//   - 어드민 아니면 → /
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  getActorActions,
  ACTION_LABELS,
  type AdminActionRecord,
} from "@/lib/admin-actions";

export const metadata: Metadata = {
  title: "내 수행 내역 | 어드민 | 정책알리미",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// details 에서 "대상 사용자 식별" 힌트 추출 — 현재는 manual_delete_user 의 email 만
function getTargetHint(record: AdminActionRecord): string | null {
  if (record.targetUserId) return null; // 살아있으면 링크로 표시
  const email = record.details?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}

export default async function MyActionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/my-actions");
  if (!isAdminUser(user.id)) redirect("/");

  const actions = await getActorActions(user.id, 50);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[860px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-burgundy font-semibold tracking-[0.2em] mb-2">
              ADMIN · 내 수행 내역
            </p>
            <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-grey-900">
              최근 {actions.length}건
            </h1>
            <p className="text-[12px] text-grey-600 mt-1">
              감사 로그는 append-only — 수정·삭제 불가, 외부 신뢰 보증용
            </p>
          </div>
          <Link href="/admin" className="text-[13px] text-blue-500 hover:underline">
            ← 검색
          </Link>
        </div>

        {/* 목록 */}
        {actions.length === 0 ? (
          <div className="bg-white border border-grey-100 rounded-xl p-10 text-center text-[14px] text-grey-600">
            수행 기록 없음
          </div>
        ) : (
          <div className="bg-white border border-grey-100 rounded-xl p-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-grey-600 border-b border-grey-200">
                  <th className="py-2 font-medium w-[160px]">시각</th>
                  <th className="py-2 font-medium w-[140px]">액션</th>
                  <th className="py-2 font-medium">대상</th>
                  <th className="py-2 font-medium">세부</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => {
                  const hint = getTargetHint(a);
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-grey-100 last:border-b-0 align-top"
                    >
                      <td className="py-2 text-grey-600 text-[12px] whitespace-nowrap">
                        {fmtDate(a.createdAt)}
                      </td>
                      <td className="py-2 font-medium text-grey-900">
                        {ACTION_LABELS[a.action] ?? a.action}
                      </td>
                      <td className="py-2 text-[12px]">
                        {a.targetUserId ? (
                          <Link
                            href={`/admin/users/${a.targetUserId}`}
                            className="text-blue-500 hover:underline font-mono"
                            title={a.targetUserId}
                          >
                            {a.targetUserId.slice(0, 8)}…
                          </Link>
                        ) : hint ? (
                          <span className="text-grey-700" title="대상 사용자 이미 탈퇴됨">
                            {hint} <span className="text-grey-500">(탈퇴)</span>
                          </span>
                        ) : (
                          <span className="text-grey-500">—</span>
                        )}
                      </td>
                      <td className="py-2 text-grey-700 text-[12px] font-mono break-all">
                        {a.details ? JSON.stringify(a.details) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 풋노트 */}
        <p className="mt-8 text-[12px] text-grey-500 leading-[1.6]">
          액션 기록은 DB 트리거(018)로 UPDATE/DELETE/TRUNCATE 모두 차단됩니다.
          <br />
          수동 수정이 필요한 경우 임시 <code>DROP TRIGGER</code> → 수정 → 재생성 절차를 따르세요.
        </p>
      </div>
    </main>
  );
}
