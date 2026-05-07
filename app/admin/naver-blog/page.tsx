// ============================================================
// /admin/naver-blog — 네이버 블로그 발행 큐
// ============================================================
// keepioo 자동 발행 글 → 네이버 블로그 백링크용 큐.
// 사장님이 사장님 네이버 계정으로 직접 발행 (네이버 공식 글쓰기 API 부재 + 약관).
//
// 사용 흐름 (사장님 30초~1분):
//   1) 카드의 "전체 복사" 버튼 → 제목·본문 모두 clipboard 에 들어감
//   2) 새 탭에서 https://blog.naver.com/GoBlogWrite.naver 접속 (네이버 글쓰기)
//   3) 제목 영역 · 본문 영역 차례로 붙여넣기 (Ctrl+V)
//   4) 발행 → 네이버 블로그 글 URL 복사
//   5) 이 페이지로 돌아와 "발행 완료" 클릭 + URL 입력 (선택)
//
// 자동 입력 모드 (옵션 A-full 후속):
//   - 채팅창에서 클로드에게 "naver-blog 큐 N번 자동 발행해줘" 요청
//   - 클로드가 사장님 브라우저로 네이버 글쓰기 페이지 자동 입력
//   - 마지막 "발행" 버튼은 사장님이 직접 클릭 (외부 게시 명시 승인)
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  listPendingNaverQueue,
  listPublishedNaverQueue,
  getNaverPublishedStats,
} from "@/lib/naver-blog/queue";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  markNaverPublishedAction,
  markNaverSkippedAction,
} from "./actions";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = {
  title: "네이버 블로그 큐 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/naver-blog");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminNaverBlogPage() {
  await requireAdmin();
  const [pending, published, stats] = await Promise.all([
    listPendingNaverQueue(20),
    listPublishedNaverQueue(10),
    getNaverPublishedStats(),
  ]);

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 마케팅"
        title="네이버 블로그 큐"
        description="keepioo 자동 발행 글을 사장님 네이버 블로그에 백링크용으로 재발행 — 도메인 권위·검색 노출 ↑"
      />

      {/* 통계 카드 4개 */}
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="대기" value={stats.pending} tone="info" />
        <StatCard label="24h 발행" value={stats.published24h} tone="ok" />
        <StatCard label="7d 발행" value={stats.published7d} tone="ok" />
        <StatCard label="30d 발행" value={stats.published30d} tone="ok" />
      </section>

      {/* 사용 가이드 */}
      <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900 leading-[1.55]">
        💡 <strong>사용법</strong>: 각 카드의 「전체 복사」 → 새 탭에서{" "}
        <a
          href="https://blog.naver.com/GoBlogWrite.naver"
          target="_blank"
          rel="noopener"
          className="underline font-semibold"
        >
          네이버 블로그 글쓰기
        </a>{" "}
        접속 → 제목·본문 붙여넣기 → 발행. 발행 후 「발행 완료」 클릭하면 큐에서 빠집니다.
        <br />
        <strong>자동 입력</strong>을 원하시면 채팅창에서 클로드에게 「naver-blog 큐 ID xxx 자동 발행해줘」라고 말씀하시면 됩니다.
      </div>

      {/* 대기 큐 */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-grey-900 mb-3">
          📋 발행 대기 ({pending.length}건)
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-grey-200 bg-grey-50 p-6 text-center text-sm text-grey-600">
            대기 중인 글이 없어요. 매일 새 블로그 자동 발행 후 자동으로 큐에 추가됩니다.
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-grey-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-grey-900 mb-1">
                      {row.payload.title}
                    </h3>
                    <p className="text-xs text-grey-600">
                      ID: <code className="font-mono">{row.id.slice(0, 8)}</code> ·
                      카테고리: {row.blog_post.category ?? "—"} · 추가일:{" "}
                      {formatDate(row.created_at)}
                    </p>
                    <p className="text-xs text-grey-500 mt-1">
                      백링크 URL:{" "}
                      <a
                        href={row.payload.backlinkUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-blue-600 hover:underline break-all"
                      >
                        {row.payload.backlinkUrl}
                      </a>
                    </p>
                  </div>
                  <CopyButton
                    title={row.payload.title}
                    body={row.payload.body}
                  />
                </div>

                {/* 본문 미리보기 (접혀 있음) */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-grey-700 font-medium hover:text-grey-900">
                    본문 미리보기 (네이버에 붙여넣을 plain text)
                  </summary>
                  <pre className="mt-2 p-3 bg-grey-50 rounded text-xs whitespace-pre-wrap font-sans text-grey-700 max-h-[400px] overflow-auto">
                    {row.payload.body}
                  </pre>
                </details>

                {/* 발행 완료 + 스킵 form */}
                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  <form
                    action={markNaverPublishedAction}
                    className="flex flex-1 gap-2 items-center min-w-[280px]"
                  >
                    <input type="hidden" name="queue_id" value={row.id} />
                    <input
                      type="url"
                      name="naver_url"
                      placeholder="네이버 블로그 글 URL (선택, 추적용)"
                      className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-grey-300 rounded"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap"
                    >
                      ✓ 발행 완료
                    </button>
                  </form>
                  <form action={markNaverSkippedAction}>
                    <input type="hidden" name="queue_id" value={row.id} />
                    <input type="hidden" name="reason" value="manual_skip" />
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium bg-grey-200 text-grey-700 rounded hover:bg-grey-300"
                    >
                      스킵
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 최근 발행 이력 */}
      <section>
        <h2 className="text-base font-semibold text-grey-900 mb-3">
          ✅ 최근 발행 이력
        </h2>
        {published.length === 0 ? (
          <p className="text-sm text-grey-500">
            아직 발행 이력이 없어요. 첫 글을 네이버 블로그에 발행하면 여기에 표시됩니다.
          </p>
        ) : (
          <ul className="divide-y divide-grey-100 rounded-lg border border-grey-200 bg-white">
            {published.map((row) => (
              <li key={row.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-grey-900 truncate">
                      {row.blog_post.title}
                    </p>
                    <p className="text-xs text-grey-500 mt-0.5">
                      {row.published_at && formatDate(row.published_at)} ·{" "}
                      {row.blog_post.category ?? "—"}
                    </p>
                  </div>
                  {row.naver_url && (
                    <a
                      href={row.naver_url}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      네이버 글 →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "info" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "border-green-100 bg-green-50 text-green-900"
      : tone === "warn"
        ? "border-amber-100 bg-amber-50 text-amber-900"
        : "border-blue-100 bg-blue-50 text-blue-900";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
