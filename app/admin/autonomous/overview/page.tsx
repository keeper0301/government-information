// ============================================================
// /admin/autonomous/overview — 자율운영 시각화 (상태판 + 추세 차트 + 흐름도)
// ============================================================
// 기존 90KB 카드형 허브(/admin/autonomous)와 별개의 "한눈에 보는" 시각 레이어.
// admin 전용(force-dynamic). 데이터는 lib/autonomous-ops/overview-metrics.
// ============================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getOverviewMetrics } from "@/lib/autonomous-ops/overview-metrics";
import { StatusBoard } from "./_components/status-board";
import { ActivityChart } from "./_components/activity-chart";
import { FlowDiagram } from "./_components/flow-diagram";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "자율운영 시각화 | 정책알리미", robots: { index: false, follow: false } };

export default async function AutonomousOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/autonomous/overview");
  if (!isAdminUser(user.email)) redirect("/");

  const metrics = await getOverviewMetrics();
  const genKst = new Date(new Date(metrics.generatedAtIso).getTime() + 9 * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
      <AdminPageHeader
        kicker="AUTONOMOUS OPS"
        title="자율운영 시각화"
        description="사이트 운영·관리가 무인 가동되는 현황을 상태판·추세·흐름으로 한눈에. 상세 제어는 자율운영 허브에서."
      />

      <div className="flex items-center gap-3 mb-6 text-[13px]">
        <Link href="/admin/autonomous" className="text-blue-600 font-semibold no-underline hover:underline">
          ← 자율운영 허브(상세 카드)
        </Link>
        <span className="text-grey-500">기준 시각 {genKst} KST</span>
      </div>

      {/* ① 한눈에 상태판 */}
      <StatusBoard systems={metrics.systems} />

      {/* ③ 흐름도 (라이브 상태 색상) */}
      <section className="mb-8">
        <FlowDiagram systems={metrics.systems} />
      </section>

      {/* ② 활동 추세 차트 */}
      <section className="mb-8">
        <h2 className="text-[18px] font-bold text-grey-900 mb-3">활동 추세 (최근 14일)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <ActivityChart title="데이터 수집량 (뉴스·보도자료)" data={metrics.collectSeries} color="#3b82f6" unit="건" />
          <ActivityChart title="블로그 발행량" data={metrics.blogSeries} color="#10b981" unit="건" />
        </div>
      </section>

      <p className="text-[12px] text-grey-500">
        상태 색: <span className="text-green-700 font-semibold">녹=정상</span> ·{" "}
        <span className="text-yellow-700 font-semibold">황=주의(예상 주기 초과)</span> ·{" "}
        <span className="text-red font-semibold">적=점검(장기 미발화)</span>. 데이터 출처: admin_actions(발화 흔적) · news_posts · blog_posts.
      </p>
    </main>
  );
}
