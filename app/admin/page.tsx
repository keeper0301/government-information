// ============================================================
// /admin — 운영자 평면 페이지 (사용자 조회 입구)
// ============================================================
// CEO 리뷰 Q10 결정: MVP 에 최소 평면 페이지 포함.
// "사용자 ID 또는 이메일로 검색 → 알림 이력 + 구독 + AI 사용량 표시"
//
// 이 페이지의 역할은 입구 + 검색 폼만. 결과 페이지는 [userId]/page.tsx.
// 권한:
//   - 비로그인 → /login
//   - 어드민 아닌 일반 사용자 → /
// ============================================================

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "어드민 | 정책알리미",
  robots: { index: false, follow: false },
};

// 권한 가드 — 어드민 아니면 즉시 리다이렉트
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.id)) redirect("/");
  return user;
}

// 검색 server action
// 입력: 이메일 또는 user_id (UUID)
// 결과: 일치하는 user 의 /admin/users/[userId] 로 redirect
async function searchUser(formData: FormData) {
  "use server";
  const raw = String(formData.get("query") ?? "").trim();
  if (!raw) return;

  const admin = createAdminClient();

  // UUID 형식이면 user_id 직접 사용
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) {
    redirect(`/admin/users/${raw}`);
  }

  // 그 외는 이메일로 간주, auth.users 에서 조회
  // listUsers + filter — 작은 운영이라 충분. 사용자 많아지면 별도 RPC.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data) {
    redirect(`/admin?error=${encodeURIComponent("조회 실패: " + (error?.message ?? "알수없음"))}`);
  }
  const found = data.users.find((u) => u.email?.toLowerCase() === raw.toLowerCase());
  if (!found) {
    redirect(`/admin?error=${encodeURIComponent("일치하는 사용자 없음: " + raw)}`);
  }
  redirect(`/admin/users/${found.id}`);
  // unreachable, 그러나 타입 만족
  revalidatePath("/admin");
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[680px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-burgundy font-semibold tracking-[0.2em] mb-3">
            ADMIN
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            사용자 조회
          </h1>
          <p className="text-[14px] text-grey-600">
            이메일 또는 사용자 UUID 로 검색하세요.
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div
            role="alert"
            className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-4"
          >
            {error}
          </div>
        )}

        {/* 검색 폼 */}
        <form action={searchUser} className="space-y-3">
          <input
            type="text"
            name="query"
            required
            placeholder="user@example.com 또는 UUID"
            className="w-full px-4 py-3 border border-grey-200 rounded-lg text-[15px] focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
          >
            조회
          </button>
        </form>

        {/* 풋노트 */}
        <p className="mt-8 text-[12px] text-grey-500 leading-[1.6]">
          이 페이지는 운영자 전용입니다. 권한은 환경변수 <code>ADMIN_USER_IDS</code> 로 관리합니다.
          <br />
          검색 가능한 정보: 구독 상태 · AI 사용량 (지난 30일) · 알림 발송 이력 (지난 30일).
        </p>

        <p className="mt-4 text-[12px] flex items-center gap-4 flex-wrap">
          <Link href="/" className="text-blue-500 underline">
            ← 홈으로
          </Link>
          <span className="text-grey-300">·</span>
          <Link href="/admin/my-actions" className="text-blue-500 underline">
            내 수행 내역 보기
          </Link>
          <span className="text-grey-300">·</span>
          <Link href="/admin/alimtalk" className="text-blue-500 underline">
            알림톡 운영
          </Link>
          <span className="text-grey-300">·</span>
          <Link href="/admin/enrich-detail" className="text-blue-500 underline">
            공고 상세 보강
          </Link>
        </p>
      </div>
    </main>
  );
}
