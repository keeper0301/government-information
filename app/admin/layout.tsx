// app/admin/layout.tsx
// ============================================================
// 어드민 공통 레이아웃 — 사이드바 + 메인 grid + 인증 가드
// ============================================================
// 모든 /admin/* 페이지에 자동 적용. sub page 자체 가드는 그대로 유지
// (defense in depth). 메인 영역 padding 은 반응형 (16/24/48).
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { Sidebar } from "@/components/admin/sidebar";
import { SidebarMobileToggle } from "@/components/admin/sidebar-mobile-toggle";
import { CmdKPalette } from "@/components/admin/cmdk-palette";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 인증 가드 — sub page 도 자체 가드 유지하므로 중복이지만 안전 마진.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.email)) redirect("/");

  return (
    <div className="min-h-screen bg-white flex">
      {/* Desktop 사이드바 — md 이상 */}
      <aside className="hidden md:block flex-shrink-0 w-[200px] xl:w-[280px]">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile 햄버거 + slide */}
      <SidebarMobileToggle />

      {/* 메인 영역 — 반응형 padding */}
      <main className="flex-1 min-w-0 px-4 md:px-7 xl:px-12 py-6 md:py-10 max-md:pt-16">
        {children}
      </main>

      {/* 명령 팔레트 — Ctrl/Cmd+K 로 어디서든 호출 (client component) */}
      <CmdKPalette />
    </div>
  );
}
