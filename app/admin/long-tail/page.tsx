// ============================================================
// /admin/long-tail — SEO long-tail 키워드 자동 글 생성 (Phase 5-A)
// ============================================================
// 사장님이 부족한 검색어 (예: "60대 부산 노인 의료비 지원") 입력 →
// publishKeywordPost 가 매칭 정책 검색 + Claude 글 생성 + blog_posts insert.
// 매주 5~10개 입력만 하면 트래픽 long-tail 자동 채움.
//
// 24h 가입 0 → 트래픽 부족이 본질적 운영 이슈. SEO long-tail 신규 페이지가
// 가장 효과적 (이미 publish-blog 매일 7글 가동 중, long-tail 추가 가속).
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LongTailForm } from "./long-tail-form";

export const metadata: Metadata = {
  title: "long-tail 자동 글 생성 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/long-tail");
  if (!isAdminUser(user.email)) redirect("/");
}

export default async function LongTailPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const generatedAt = new Date();
  const since7d = new Date(
    generatedAt.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 최근 long_tail audit 로그 (admin_actions where action='blog_publish' AND details.source='long_tail')
  const { data: recentActions } = await admin
    .from("admin_actions")
    .select("created_at, details")
    .eq("action", "blog_publish")
    .gte("created_at", since7d)
    .order("created_at", { ascending: false })
    .limit(30);

  const longTailItems = (recentActions ?? []).filter((r) => {
    const d = (r as { details: { source?: string } }).details;
    return d?.source === "long_tail";
  });

  const { count: total } = await admin
    .from("blog_posts")
    .select("id", { count: "exact", head: true });

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[820px] mx-auto px-5">
        <AdminPageHeader
          kicker="ADMIN · SEO"
          title="long-tail 자동 글 생성"
          description="부족한 검색어를 입력하면 매칭 정책 + Claude 가 SEO 친화 글 자동 생성. 매주 5~10건 권장."
        />

        {/* 안내 박스 */}
        <section className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 leading-[1.6]">
          <p className="font-semibold mb-1">📝 사용 가이드</p>
          <ul className="list-disc list-inside space-y-1 text-blue-800">
            <li>사장님이 매주 1회, 부족한 검색어 5~10개 입력</li>
            <li>예: <code className="text-xs bg-white px-1 rounded">60대 부산 노인 의료비</code> · <code className="text-xs bg-white px-1 rounded">청년 농업인 정착 지원금</code></li>
            <li>키워드 → 매칭 정책 자동 검색 → Claude 가 본문 생성 → 블로그에 즉시 발행</li>
            <li>이미 발행된 정책은 자동 제외 (중복 X). 매칭 0건이면 에러 반환</li>
          </ul>
        </section>

        {/* 입력 폼 */}
        <section className="mb-8">
          <LongTailForm />
        </section>

        {/* 통계 */}
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-grey-200 bg-grey-50 p-3">
            <p className="text-xs font-semibold text-grey-700 mb-1">전체 blog_posts</p>
            <p className="text-2xl font-extrabold tracking-[-0.5px]">{total ?? 0}건</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-900 mb-1">7d long-tail 발행</p>
            <p className="text-2xl font-extrabold tracking-[-0.5px] text-blue-900">{longTailItems.length}건</p>
          </div>
        </section>

        {/* 최근 long-tail 목록 */}
        <section>
          <h2 className="text-base font-bold text-grey-900 mb-3">7d long-tail 발행 ({longTailItems.length})</h2>
          {longTailItems.length === 0 ? (
            <div className="rounded-lg border border-grey-200 bg-white p-5 text-sm text-grey-600">
              아직 long-tail 글 발행 없음. 위 폼에서 첫 키워드 입력해 보세요.
            </div>
          ) : (
            <div className="space-y-2">
              {longTailItems.map((r, idx) => {
                const d = (r as { created_at: string; details: { keyword?: string; title?: string; slug?: string; category?: string } });
                return (
                  <div key={idx} className="rounded-lg border border-grey-200 bg-white p-3 text-sm">
                    <div className="flex items-start gap-3 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-blue-600 px-2 py-0.5 rounded bg-blue-50 border border-blue-100">
                        {d.details.keyword}
                      </span>
                      <span className="text-xs text-grey-500">
                        {d.details.category ?? "—"}
                      </span>
                      <span className="text-xs text-grey-500 ml-auto whitespace-nowrap">
                        {new Date(d.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                      </span>
                    </div>
                    {d.details.slug ? (
                      <Link
                        href={`/blog/${d.details.slug}`}
                        target="_blank"
                        className="text-grey-900 font-semibold hover:text-blue-600 hover:underline break-all"
                      >
                        {d.details.title ?? d.details.slug}
                      </Link>
                    ) : (
                      <span className="text-grey-700">{d.details.title}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-10 text-sm">
          <Link href="/admin" className="text-blue-500 font-medium underline">← 어드민 홈</Link>
        </p>
      </div>
    </main>
  );
}
