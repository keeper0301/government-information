import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { submitSearchConsoleSitemap } from "@/lib/external-console/search-console";
import { logAdminAction } from "@/lib/admin-actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "Search Console 제출 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SITEMAP_URL = "https://www.keepioo.com/sitemap.xml";
const PRIORITY_URLS = [
  "https://www.keepioo.com/",
  "https://www.keepioo.com/about",
  "https://www.keepioo.com/contact",
  "https://www.keepioo.com/guides",
  "https://www.keepioo.com/welfare",
  "https://www.keepioo.com/loan",
  "https://www.keepioo.com/guides/jobseeker-benefit-checklist",
  "https://www.keepioo.com/guides/emergency-welfare-application-guide",
  "https://www.keepioo.com/guides/self-employed-family-income-proof",
];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/search-console");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

async function submitSitemapAction(): Promise<void> {
  "use server";

  const user = await requireAdmin();
  try {
    const result = await submitSearchConsoleSitemap({ sitemapUrl: SITEMAP_URL });
    await logAdminAction({
      actorId: user.id,
      action: "search_console_sitemap_submit_run",
      details: {
        source: "admin_search_console_page",
        site_url: result.siteUrl,
        sitemap_url: result.sitemapUrl,
        status: result.status,
      },
    });
    redirect(
      `/admin/search-console?ok=1&status=${encodeURIComponent(String(result.status))}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search Console 제출 실패";
    await logAdminAction({
      actorId: user.id,
      action: "search_console_sitemap_submit_run",
      details: {
        source: "admin_search_console_page",
        ok: false,
        error: message.slice(0, 500),
      },
    });
    redirect(`/admin/search-console?error=${encodeURIComponent(message.slice(0, 240))}`);
  }
}

export default async function SearchConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; status?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const hasCredentials = Boolean(
    process.env.SC_SITE_URL &&
      process.env.SC_CLIENT_ID &&
      process.env.SC_CLIENT_SECRET &&
      process.env.SC_REFRESH_TOKEN,
  );

  return (
    <main className="max-w-5xl">
      <AdminPageHeader
        kicker="ADSENSE REVIEW"
        title="Search Console 재제출"
        description="애드센스 재심사 전 sitemap 제출과 우선 URL 검사 목록을 한 곳에서 확인합니다. Google 공개 sitemap ping 은 폐기되어 Search Console API 또는 콘솔 수동 제출이 필요합니다."
      />

      {params.ok && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Search Console sitemap 제출 완료. status: {params.status ?? "ok"}
        </div>
      )}
      {params.error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          제출 실패: {params.error}
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-grey-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-grey-900">Sitemap 제출</h2>
            <p className="mt-1 text-sm text-grey-600">
              대상 sitemap: <code>{SITEMAP_URL}</code>
            </p>
            <p className="mt-1 text-xs text-grey-500">
              필요 env: SC_SITE_URL, SC_CLIENT_ID, SC_CLIENT_SECRET, SC_REFRESH_TOKEN
            </p>
          </div>
          <form action={submitSitemapAction}>
            <button
              type="submit"
              disabled={!hasCredentials}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-grey-300"
            >
              Google Search Console에 sitemap 제출
            </button>
          </form>
        </div>
        {!hasCredentials && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Search Console OAuth env 가 production에 없으면 버튼 제출은 실패합니다. 이 경우 아래 URL을 Search Console에서 직접 검사·제출하세요.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-grey-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-grey-900">URL 검사 우선순위</h2>
        <p className="mt-1 text-sm text-grey-600">
          AdSense 재심사 전에 아래 URL을 Search Console URL 검사에서 색인 요청하세요.
        </p>
        <ol className="mt-4 space-y-2 text-sm">
          {PRIORITY_URLS.map((url) => (
            <li key={url} className="rounded-xl border border-grey-100 bg-grey-50 p-3">
              <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                {url}
              </a>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <Link className="rounded-lg border px-3 py-2 no-underline" href="/sitemap.xml" target="_blank">
            live sitemap 열기
          </Link>
          <Link className="rounded-lg border px-3 py-2 no-underline" href="/guides" target="_blank">
            guides 확인
          </Link>
          <Link className="rounded-lg border px-3 py-2 no-underline" href="/contact" target="_blank">
            contact 확인
          </Link>
        </div>
      </section>
    </main>
  );
}
