// ============================================================
// lib/bookmarks.ts — 사용자 북마크 (찜하기) 서버 헬퍼
// ============================================================
// 정책 상세 페이지의 별표 토글, /mypage/bookmarks 페이지가 공유.

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProgramType = "welfare" | "loan";

// 현재 사용자가 특정 정책을 북마크 했는지 확인 (정책 상세 페이지 진입 시 사용).
// 비로그인 = false 반환 (RLS 가 막아도 명시적으로 빨리 처리).
export async function isBookmarked(
  programType: ProgramType,
  programId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("user_bookmarks")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("program_type", programType)
    .eq("program_id", programId)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

// 토글 — 이미 있으면 삭제, 없으면 추가. 결과 (true=저장됨/false=해제됨) 반환.
// program 상세 페이지의 BookmarkButton 가 호출.
export async function toggleBookmark(
  programType: ProgramType,
  programId: string,
): Promise<{ ok: boolean; bookmarked?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "로그인이 필요해요" };
  }

  // 현재 상태 확인
  const { data: existing } = await supabase
    .from("user_bookmarks")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("program_type", programType)
    .eq("program_id", programId)
    .maybeSingle();

  if (existing) {
    // 이미 있음 → 삭제 (해제)
    const { error } = await supabase
      .from("user_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("program_type", programType)
      .eq("program_id", programId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/mypage/bookmarks");
    return { ok: true, bookmarked: false };
  }

  // 없음 → 추가
  const { error } = await supabase.from("user_bookmarks").insert({
    user_id: user.id,
    program_type: programType,
    program_id: programId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mypage/bookmarks");
  return { ok: true, bookmarked: true };
}

// /mypage/bookmarks 페이지에서 사용자의 모든 북마크 조회 — welfare/loan 합쳐서.
// 각 정책의 기본 정보 (제목·카테고리·D-day) 를 join 해서 반환.
export type BookmarkItem = {
  programType: ProgramType;
  programId: string;
  bookmarkedAt: string;
  title: string;
  category: string | null;
  region: string | null;
  applyEnd: string | null;
};

export async function getMyBookmarks(): Promise<BookmarkItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("user_bookmarks")
    .select("program_type, program_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!rows || rows.length === 0) return [];

  // welfare / loan 각각 ID 모아 한 번씩 조회 (N+1 방지)
  const welfareIds = rows
    .filter((r) => r.program_type === "welfare")
    .map((r) => r.program_id);
  const loanIds = rows
    .filter((r) => r.program_type === "loan")
    .map((r) => r.program_id);

  const [welfareRes, loanRes] = await Promise.all([
    welfareIds.length > 0
      ? supabase
          .from("welfare_programs")
          .select("id, title, category, region, apply_end")
          .in("id", welfareIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; category: string | null; region: string | null; apply_end: string | null }> }),
    loanIds.length > 0
      ? supabase
          .from("loan_programs")
          .select("id, title, category, region, apply_end")
          .in("id", loanIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; category: string | null; region: string | null; apply_end: string | null }> }),
  ]);

  const welfareMap = new Map(
    (welfareRes.data ?? []).map((p) => [p.id, p]),
  );
  const loanMap = new Map(
    (loanRes.data ?? []).map((p) => [p.id, p]),
  );

  // bookmark 순서 그대로 유지 (created_at DESC) + 사라진 정책은 제외
  const items: BookmarkItem[] = [];
  for (const r of rows) {
    const map = r.program_type === "welfare" ? welfareMap : loanMap;
    const program = map.get(r.program_id);
    if (!program) continue; // 정책이 삭제된 경우 스킵
    items.push({
      programType: r.program_type as ProgramType,
      programId: r.program_id,
      bookmarkedAt: r.created_at,
      title: program.title,
      category: program.category,
      region: program.region,
      applyEnd: program.apply_end,
    });
  }
  return items;
}
