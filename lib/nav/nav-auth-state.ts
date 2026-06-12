"use server";

// ============================================================
// getNavAuthState — 네비게이션 로그인/관리자/알림수 (서버 액션)
// ============================================================
// 배경: 루트 레이아웃(app/layout.tsx)이 auth.getUser 쿠키를 읽어 Nav 에 내려주면
//   앱의 모든 페이지가 동적 렌더링으로 강제돼 캐시가 안 된다(전 사이트 TTFB ~550ms).
//   따라서 레이아웃은 쿠키를 읽지 않고 정적으로 두고, Nav(client)가 mount 후 이
//   서버 액션을 호출해 로그인 상태를 받아온다. 익명·크롤러는 loggedIn=false 즉시 반환.
//   isAdmin 은 ADMIN_EMAILS(서버 전용 env)라 클라이언트가 직접 계산 못 함 → 서버 액션 필수.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";

export type NavAuthState = {
  loggedIn: boolean;
  isAdmin: boolean;
  alarmCount: number;
};

export async function getNavAuthState(): Promise<NavAuthState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { loggedIn: false, isAdmin: false, alarmCount: 0 };

  const isAdmin = isAdminUser(user.email);

  // 헤더 종 아이콘 활성 알림 개수 (레이아웃에서 옮겨옴).
  const { count } = await supabase
    .from("alarm_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  return { loggedIn: true, isAdmin, alarmCount: count ?? 0 };
}
