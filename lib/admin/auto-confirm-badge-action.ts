"use server";

// ============================================================
// fetchAutoConfirmBadge — 관리자 전용 자동등록 배지 context (서버 액션)
// ============================================================
// 배경: 정책 상세 페이지를 정적 ISR 로 전환(2026-06-13)하면서, 서버 렌더에서
//   쿠키(auth.getUser)를 읽으면 페이지가 동적으로 강제돼 캐시가 안 된다. 따라서
//   관리자 판정 + candidateId 조회를 이 서버 액션으로 빼고, 클라이언트 래퍼
//   (AdminAutoConfirmBadge)가 mount 후 호출한다. 일반 사용자·크롤러는 호출하지
//   않으므로(클라이언트에서 로그인 사용자일 때만 호출) 정적 페이지가 유지된다.
//
// 보안: 관리자가 아니면 null 반환(배지 미노출). candidateId 조회는 admin 일 때만.
//   (회수/복원 실제 동작은 AutoConfirmBadge 의 server action 이 별도 requireAdmin 가드)
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { findCandidateByProgramId } from "@/lib/press-ingest/candidates";

export type AutoConfirmBadgeContext = {
  candidateId: string | null;
};

export async function fetchAutoConfirmBadge(
  table: "welfare_programs" | "loan_programs",
  programId: string,
): Promise<AutoConfirmBadgeContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) return null;

  const candidate = await findCandidateByProgramId({ table, programId });
  return { candidateId: candidate?.candidateId ?? null };
}
