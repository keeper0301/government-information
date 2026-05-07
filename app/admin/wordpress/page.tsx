// ============================================================
// /admin/wordpress — 워드프레스 자동 발행 이력
// ============================================================
// keepioo blog 자동 발행 직후 워드프레스에도 REST API 로 즉시 발행.
// 큐 형태 X (네이버와 다름) — 결과 이력만 기록.
//
// 사장님이 보는 것:
//   1) 통계 카드 (24h/7d/30d 발행, 24h 실패)
//   2) 최근 성공 발행 (워드프레스 글 URL 클릭 가능)
//   3) 최근 실패 발행 (error message — 디버깅용)
//   4) 환경변수 설정 안내 (WP_API_URL/WP_USERNAME/WP_APP_PASSWORD)
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "워드프레스 자동 발행 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/wordpress");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

async function loadData() {
  const admin = createAdminClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [pub24, pub7, pub30, fail24, recentPub, recentFail] = await Promise.all([
    admin
      .from("wordpress_publish_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", since24h),
    admin
      .from("wordpress_publish_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", since7d),
    admin
      .from("wordpress_publish_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", since30d),
    admin
      .from("wordpress_publish_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("failed_at", since24h),
    admin
      .from("wordpress_publish_log")
      .select(
        "id, wp_post_id, wp_post_url, published_at, blog_post:blog_posts!inner(slug, title)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(15),
    admin
      .from("wordpress_publish_log")
      .select(
        "id, error_message, failed_at, blog_post:blog_posts!inner(slug, title)",
      )
      .eq("status", "failed")
      .order("failed_at", { ascending: false })
      .limit(10),
  ]);

  return {
    stats: {
      published24h: pub24.count ?? 0,
      published7d: pub7.count ?? 0,
      published30d: pub30.count ?? 0,
      failed24h: fail24.count ?? 0,
    },
    recentPublished: (recentPub.data ?? []) as unknown as Array<{
      id: string;
      wp_post_id: number | null;
      wp_post_url: string | null;
      published_at: string;
      blog_post: { slug: string; title: string };
    }>,
    recentFailed: (recentFail.data ?? []) as unknown as Array<{
      id: string;
      error_message: string | null;
      failed_at: string;
      blog_post: { slug: string; title: string };
    }>,
  };
}

export default async function AdminWordPressPage() {
  await requireAdmin();
  const data = await loadData();

  // 환경변수 설정 여부 — 사장님이 발급 안 했으면 안내 배너 표시
  const hasCredentials =
    !!process.env.WP_API_URL &&
    !!process.env.WP_USERNAME &&
    !!process.env.WP_APP_PASSWORD;

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 마케팅"
        title="워드프레스 자동 발행"
        description="keepioo 자동 블로그 발행 직후 워드프레스에도 REST API 로 즉시 발행 — 백링크·도메인 권위 ↑"
      />

      {!hasCredentials && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>⚠️ 워드프레스 환경변수 미설정</strong>
          <br />
          아래 3개 환경변수를 Vercel Dashboard 에 추가하면 다음 cron 부터 자동 발행됩니다:
          <ul className="mt-2 list-disc pl-5 text-xs leading-[1.7]">
            <li>
              <code>WP_API_URL</code> — 예:{" "}
              <code>https://keepioopolicy.wordpress.com/wp-json/wp/v2</code>
            </li>
            <li>
              <code>WP_USERNAME</code> — wordpress.com 사용자명
            </li>
            <li>
              <code>WP_APP_PASSWORD</code> — Application Passwords 24자리
            </li>
          </ul>
          <p className="mt-2 text-xs">
            발급 절차:{" "}
            <a
              href="https://wordpress.com/me/security/two-step"
              target="_blank"
              rel="noopener"
              className="underline font-semibold"
            >
              Account Settings → Security → Application Passwords
            </a>
          </p>
        </div>
      )}

      {/* 통계 카드 4개 */}
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="24h 발행" value={data.stats.published24h} tone="ok" />
        <StatCard label="7d 발행" value={data.stats.published7d} tone="ok" />
        <StatCard label="30d 발행" value={data.stats.published30d} tone="ok" />
        <StatCard
          label="24h 실패"
          value={data.stats.failed24h}
          tone={data.stats.failed24h > 0 ? "warn" : "info"}
        />
      </section>

      {/* 최근 실패 (있으면) */}
      {data.recentFailed.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-grey-900 mb-3">
            ⚠️ 최근 발행 실패 ({data.recentFailed.length}건)
          </h2>
          <ul className="space-y-2">
            {data.recentFailed.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs"
              >
                <p className="font-medium text-grey-900">
                  {row.blog_post.title}
                </p>
                <p className="text-red-800 font-mono mt-1 break-all">
                  {row.error_message ?? "(원인 불명)"}
                </p>
                <p className="text-grey-500 mt-1">
                  {row.failed_at && formatDate(row.failed_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 최근 발행 이력 */}
      <section>
        <h2 className="text-base font-semibold text-grey-900 mb-3">
          ✅ 최근 발행 이력 ({data.recentPublished.length}건)
        </h2>
        {data.recentPublished.length === 0 ? (
          <div className="rounded-lg border border-grey-200 bg-grey-50 p-6 text-center text-sm text-grey-600">
            {hasCredentials
              ? "아직 발행 이력이 없어요. 매일 06:00 UTC blog publish cron 후 자동 발행됩니다."
              : "환경변수 설정 후 다음 cron 부터 발행됩니다."}
          </div>
        ) : (
          <ul className="divide-y divide-grey-100 rounded-lg border border-grey-200 bg-white">
            {data.recentPublished.map((row) => (
              <li key={row.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-grey-900 truncate">
                      {row.blog_post.title}
                    </p>
                    <p className="text-xs text-grey-500 mt-0.5">
                      {row.published_at && formatDate(row.published_at)}
                    </p>
                  </div>
                  {row.wp_post_url && (
                    <a
                      href={row.wp_post_url}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      워드프레스 글 →
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
