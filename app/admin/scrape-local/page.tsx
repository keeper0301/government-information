// ============================================================
// /admin/scrape-local — Phase B 시·군 보도자료 수동 수집 페이지
// ============================================================
// 사장님 1 클릭 호출 + 최근 cron/manual 결과 + 누적 수집 통계.
//
// cron 가동: 매일 KST 09:00 (/api/cron/scrape-local-press).
// 이 페이지는 cron 외 임시 호출 + 모니터링 도구.
// ============================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ScrapeCityCard } from "./scrape-city-card";

export const metadata: Metadata = {
  title: "시·군 보도자료 수집 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/scrape-local");
  if (!isAdminUser(user.email)) redirect("/");
}

type RecentRun = {
  ministry: string;
  trigger: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  createdAt: string;
};

// 도시별 최근 24h 수집 통계 + news_posts 누적 수
async function loadCityStats(): Promise<
  Record<string, { recent: RecentRun | null; total: number }>
> {
  const admin = createAdminClient();
  const ministries = ["전라남도 순천시", "광주광역시"];

  const results: Record<string, { recent: RecentRun | null; total: number }> = {};

  for (const ministry of ministries) {
    // 최근 1건 (cron 또는 manual)
    const { data: recentRows } = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "local_press_scrape")
      .order("created_at", { ascending: false })
      .limit(20);

    let recent: RecentRun | null = null;
    if (recentRows) {
      for (const row of recentRows) {
        const d = (row.details ?? {}) as Record<string, unknown>;
        if (d.ministry === ministry) {
          recent = {
            ministry,
            trigger: String(d.trigger ?? "—"),
            fetched: Number(d.fetched ?? 0),
            inserted: Number(d.inserted ?? 0),
            skipped: Number(d.skipped ?? 0),
            errors: Array.isArray(d.errors) ? (d.errors as string[]) : [],
            createdAt: String(row.created_at),
          };
          break;
        }
      }
    }

    // 누적 news_posts 수 (해당 ministry)
    const { count } = await admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .eq("ministry", ministry);

    results[ministry] = { recent, total: count ?? 0 };
  }

  return results;
}

export default async function Page() {
  await requireAdmin();
  const stats = await loadCityStats();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminPageHeader
        kicker="ADMIN · 컨텐츠 발행"
        title="시·군 보도자료 수집"
        description="Phase B — 시·군 단위 보도자료 외부 수집. 매일 KST 09:00 cron 자동 가동 + 1 클릭 수동 호출. press_ingest 가 KST 10:30 에 자동 분류."
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-700">
        <p>
          📌 자동 가동: 매일 KST 09:00 (
          <code>/api/cron/scrape-local-press</code>). 수동 호출은 cron 외 즉시
          가져오기.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          수집된 보도자료는 <code>news_posts</code> 에 저장 → press_ingest cron
          (10:30 / 15:30 / 19:30) 이 자동 분류 → welfare / loan 자동 등록.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ScrapeCityCard
          city="suncheon"
          cityLabel="순천시"
          siteUrl="http://www.suncheon.go.kr/kr/news/0006/0001/"
          ministry="전라남도 순천시"
          stats={stats["전라남도 순천시"]}
        />
        <ScrapeCityCard
          city="gwangju"
          cityLabel="광주광역시"
          siteUrl="https://www.gwangju.go.kr/boardList.do?pageId=www789&boardId=BD_0000000027"
          ministry="광주광역시"
          stats={stats["광주광역시"]}
        />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <p className="mb-2 font-semibold text-slate-700">시·군 추가 안내</p>
        <p>
          다른 시·군 추가하려면 <code>lib/scraping/local-press/</code> 에 collector{" "}
          신규 + COLLECTORS 배열에 추가. 사이트별 HTML 다른 CMS 라 시·군마다 별도{" "}
          collector 작성 권장.
        </p>
      </div>
    </div>
  );
}
