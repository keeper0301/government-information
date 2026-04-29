// app/sentry-example-page/page.tsx
// ============================================================
// Sentry 통합 검증 페이지 — admin only, 의도된 에러 trigger 용
// ============================================================
// 사장님이 Sentry 콘솔(env 등록 + redeploy 후) 에서 에러가 정상 도달하는지
// 한 번에 확인하기 위한 페이지. Server Action 으로 throw 하므로
// 서버 runtime → Sentry 수신 → 콘솔 Issues 탭 노출 흐름을 검증한다.
//
// 일반 사용자에게 노출되면 안 되므로 admin gate 적용:
//   - 미로그인: /login 으로
//   - admin 아님: 홈으로
// 검색엔진 노출 차단: robots noindex,nofollow.
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";

export const metadata = {
  title: "Sentry 검증 | 어드민",
  robots: { index: false, follow: false },
};

export default async function SentryExamplePage() {
  // admin gate — sub page 자체 가드 (defense in depth)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user.email)) redirect("/");

  // Server Action — 클릭 시 의도된 에러 throw → Sentry 가 자동 capture
  async function triggerError() {
    "use server";
    throw new Error("Sentry 검증 — 의도된 에러");
  }

  return (
    <main className="min-h-screen pt-[80px] pb-20 max-w-lg mx-auto px-5">
      {/* 작은 카테고리 라벨 */}
      <p className="text-xs font-bold text-grey-600 uppercase tracking-wider mb-2">
        어드민 · 운영 도구
      </p>

      {/* 큰 제목 */}
      <h1 className="text-2xl font-extrabold mb-4">Sentry 검증</h1>

      {/* 사용 안내 */}
      <p className="text-sm text-grey-700 mb-6">
        아래 버튼을 클릭하면 서버에서 의도된 에러를 발생시킵니다.
        <br />
        Sentry 콘솔의 Issues 탭에 이 에러가 도달하면 통합이 정상 동작하는
        것입니다 (env 등록 + redeploy 가 모두 완료된 상태에서만 도달).
      </p>

      {/* 빨강 버튼 — 의도된 에러 trigger */}
      <form action={triggerError}>
        <button
          type="submit"
          className="px-5 py-3 bg-red-500 text-white rounded-lg text-base font-bold hover:bg-red-600 transition-colors"
        >
          의도된 에러 발생
        </button>
      </form>
    </main>
  );
}
