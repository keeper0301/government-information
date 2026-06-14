// ============================================================
// /admin/instagram-comments — IG 댓글 답글 검수·승인 (human-in-loop)
// ============================================================
// 수집된 댓글 + AI 초안을 보여주고, 사장님이 편집·승인하면 게시. 자동 게시 없음.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { listByStatus, type CommentReplyRow } from "@/lib/instagram/comment-queue";
import { approveAndPost, skipComment } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "인스타 댓글 답글 검수 | 정책알리미",
  robots: { index: false, follow: false },
};

function fmt(value: string | null): string {
  if (!value) return "-";
  return new Date(new Date(value).getTime() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 16);
}

function PendingCard({ row }: { row: CommentReplyRow }) {
  return (
    <div className="border border-grey-200 rounded-xl p-4 bg-white mb-3">
      <div className="text-[12px] text-grey-500 mb-1">
        @{row.commenter_username ?? "익명"} · {fmt(row.comment_at)} · 게시물 {row.media_id.slice(-8)}
      </div>
      <div className="text-[14px] text-grey-900 font-medium mb-3 whitespace-pre-wrap">
        💬 {row.comment_text}
      </div>
      <form>
        <input type="hidden" name="id" value={row.id} />
        <textarea
          name="reply"
          defaultValue={row.draft_reply ?? ""}
          maxLength={280}
          rows={3}
          placeholder={row.draft_reply === null ? "AI 초안 생성 실패 — 직접 입력하세요" : ""}
          className="w-full border border-grey-300 rounded-md p-2 text-[14px] mb-2"
        />
        <div className="flex gap-2">
          <button
            formAction={approveAndPost}
            className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-[13px] font-semibold no-underline hover:bg-blue-700"
          >
            승인·게시
          </button>
          <button
            formAction={skipComment}
            className="px-4 py-1.5 rounded-md border border-grey-300 text-grey-700 text-[13px] hover:bg-grey-50"
          >
            건너뛰기
          </button>
        </div>
      </form>
    </div>
  );
}

export default async function InstagramCommentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/instagram-comments");
  if (!isAdminUser(user.email)) redirect("/");

  const admin = createAdminClient();
  const [pending, posted, failed] = await Promise.all([
    listByStatus(admin, "pending"),
    listByStatus(admin, "posted", 10),
    listByStatus(admin, "failed", 10),
  ]);

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
      <AdminPageHeader
        kicker="INSTAGRAM"
        title="댓글 답글 검수"
        description="@keepioo_official 댓글에 AI가 답글 초안을 만들고, 사장님이 검수·승인한 것만 게시합니다. 자동 게시는 하지 않습니다."
      />

      <h2 className="text-[16px] font-bold text-grey-900 mb-3">검수 대기 {pending.length}건</h2>
      {pending.length === 0 ? (
        <p className="text-[13px] text-grey-500 mb-8">대기 중인 댓글이 없습니다.</p>
      ) : (
        <div className="mb-8">{pending.map((row) => <PendingCard key={row.id} row={row} />)}</div>
      )}

      {failed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[16px] font-bold text-red mb-3">게시 실패 {failed.length}건 (재시도 가능)</h2>
          {failed.map((row) => (
            <div key={row.id} className="border border-red-200 rounded-lg p-3 bg-red-50/40 mb-2 text-[13px]">
              <div className="text-grey-700">💬 {row.comment_text}</div>
              <div className="text-red mt-1">⚠️ {row.error}</div>
            </div>
          ))}
        </section>
      )}

      {posted.length > 0 && (
        <section>
          <h2 className="text-[16px] font-bold text-grey-900 mb-3">최근 게시 {posted.length}건</h2>
          {posted.map((row) => (
            <div key={row.id} className="border border-grey-200 rounded-lg p-3 bg-grey-50/40 mb-2 text-[13px]">
              <div className="text-grey-500">💬 {row.comment_text}</div>
              <div className="text-green-700 mt-1">↳ {row.draft_reply} · {fmt(row.created_at)}</div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
