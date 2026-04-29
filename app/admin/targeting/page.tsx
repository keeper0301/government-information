// ============================================================
// /admin/targeting — Phase 1.5 본문 분석 진행률 + 백필 trigger 안내
// ============================================================
// welfare_programs / loan_programs 각각:
//   - last_targeting_analyzed_at NOT NULL 인 행 수 → 분석 완료 비율
//   - income_target_level 분포 (low / mid_low / mid / any / null)
//
// 백필은 브라우저에서 직접 호출 불가 (Bearer 헤더 첨부 불가).
// curl 명령어를 페이지에 표시하고, 1000건 단위 반복 호출을 안내.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "본문 분석 운영 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 기존 admin 페이지와 동일한 권한 게이트 패턴
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/targeting");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// income_target_level 분포 타입
type IncomeDist = {
  low: number;
  mid_low: number;
  mid: number;
  any: number;
  null: number;
};

// 테이블별 통계 타입
type TableStats = {
  total: number;
  analyzed: number;
  income: IncomeDist;
};

// welfare_programs / loan_programs 두 테이블 통계 수집 — 병렬 처리
async function getStats(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Record<string, TableStats>> {
  const tables = ["welfare_programs", "loan_programs"] as const;
  const stats: Record<string, TableStats> = {};

  for (const table of tables) {
    // 전체 수, 분석 완료 수, income 분포를 한 번에 병렬 수집
    const [
      { count: total },
      { count: analyzed },
      { data: incomeDist },
    ] = await Promise.all([
      // 전체 행 수
      supabase.from(table).select("*", { count: "exact", head: true }),
      // last_targeting_analyzed_at 가 있는 행만 카운트 (분석 완료)
      supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .not("last_targeting_analyzed_at", "is", null),
      // income_target_level 전체 값 수집 — 분포 계산용
      supabase.from(table).select("income_target_level"),
    ]);

    // income_target_level 분포 집계
    const income: IncomeDist = { low: 0, mid_low: 0, mid: 0, any: 0, null: 0 };
    for (const row of (incomeDist ?? []) as { income_target_level: string | null }[]) {
      const key = (row.income_target_level ?? "null") as keyof IncomeDist;
      // 예상 외 값은 null 로 처리 (안전장치)
      if (key in income) income[key]++;
      else income["null"]++;
    }

    stats[table] = { total: total ?? 0, analyzed: analyzed ?? 0, income };
  }

  return stats;
}

// 한국어 테이블명 매핑
const TABLE_LABELS: Record<string, string> = {
  welfare_programs: "복지 공고 (welfare_programs)",
  loan_programs: "대출·자금 공고 (loan_programs)",
};

export default async function TargetingAdminPage() {
  // 권한 게이트 — 비로그인/비어드민은 리다이렉트
  await requireAdmin();

  const supabase = createAdminClient();
  const stats = await getStats(supabase);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
        <AdminPageHeader
          kicker="ADMIN · 지표·분석"
          title="본문 분석 운영"
          description="welfare/loan 공고 본문에서 소득 분위·나이·가구 등 targeting 필드를 추출하는 cron 현황"
        />

        {/* 진행률 카드 — 테이블별 */}
        <section className="mb-8 space-y-4">
          <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">분석 진행률</h2>
          {Object.entries(stats).map(([table, s]) => {
            // 전체 대비 분석 완료 비율 (0으로 나누기 방지)
            const pct = s.total > 0 ? Math.round((s.analyzed / s.total) * 100) : 0;
            // 비율에 따라 게이지 색상 결정
            const gaugeColor =
              pct >= 80
                ? "bg-emerald-500"
                : pct >= 40
                  ? "bg-yellow-400"
                  : "bg-red-400";

            return (
              <div
                key={table}
                className="bg-white rounded-lg border border-grey-200 p-5"
              >
                <h3 className="text-sm font-bold text-grey-900 mb-3 tracking-[-0.2px]">
                  {TABLE_LABELS[table] ?? table}
                </h3>

                {/* 분석 완료 숫자 + 비율 */}
                <p className="text-sm text-grey-700 mb-2">
                  분석 완료:{" "}
                  <span className="font-semibold">
                    {s.analyzed.toLocaleString()}
                  </span>{" "}
                  / {s.total.toLocaleString()}건
                  <span className="ml-2 font-bold text-emerald-700">
                    ({pct}%)
                  </span>
                </p>

                {/* 진행률 게이지 바 */}
                <div className="w-full h-2 bg-grey-100 rounded-full overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all ${gaugeColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* income_target_level 분포 */}
                <div className="text-sm text-grey-600 bg-grey-50 rounded-md px-3 py-2 border border-grey-100 leading-[1.5]">
                  <span className="font-semibold text-grey-700">income 분포 </span>
                  <span className="ml-1">
                    low <strong>{s.income.low.toLocaleString()}</strong>
                    {" · "}
                    mid_low <strong>{s.income.mid_low.toLocaleString()}</strong>
                    {" · "}
                    mid <strong>{s.income.mid.toLocaleString()}</strong>
                    {" · "}
                    any <strong>{s.income.any.toLocaleString()}</strong>
                    {" · "}
                    null(미분석/불명){" "}
                    <strong>{s.income.null.toLocaleString()}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        {/* 백필 trigger 안내 */}
        <section className="border-2 border-emerald-300 rounded-xl p-5 bg-emerald-50/30 mb-8">
          <h2 className="text-base font-bold text-grey-900 mb-2 tracking-[-0.3px]">
            백필 batch trigger
          </h2>
          <p className="text-sm text-grey-700 mb-1 leading-[1.6]">
            한 번 호출에 최대 1,000건 처리합니다. 미분석 공고가 남아 있으면 반복 호출하세요.
          </p>
          <p className="text-sm text-grey-600 mb-3 leading-[1.6]">
            cron이 매일 08:00 UTC에 자동 실행되지만, 즉시 백필이 필요할 때 아래 명령어를 사용하세요.
          </p>

          {/* curl 명령어 코드 블록 */}
          <code className="block text-xs text-zinc-800 bg-white px-4 py-3 rounded-lg border border-zinc-200 font-mono break-all leading-relaxed">
            curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; \<br />
            &nbsp;&nbsp;&quot;https://keepioo.com/api/enrich-targeting?backfill=1&amp;batch=1000&quot;
          </code>

          <p className="text-sm text-zinc-600 mt-3 leading-[1.6]">
            ⚠️ 브라우저 클릭으로는 Bearer 헤더 첨부 불가 — curl 또는 cron 자동 실행(08:00 UTC)을 사용하세요.
          </p>
          <p className="text-sm text-zinc-600 mt-1 leading-[1.6]">
            $CRON_SECRET 는 Vercel 환경변수 CRON_SECRET 값. 로컬에서는{" "}
            <code className="bg-white px-1 py-0.5 rounded border border-zinc-200">
              CRON_SECRET=xxx curl ...
            </code>{" "}
            형태로 사용.
          </p>
        </section>

        {/* 어드민 허브로 돌아가기 */}
        <Link
          href="/admin"
          className="text-sm font-medium text-blue-500 hover:underline"
        >
          ← 어드민 허브로
        </Link>
      </div>
    </main>
  );
}
