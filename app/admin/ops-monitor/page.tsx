// ============================================================
// /admin/ops-monitor — 어드민 자동화 #3 가동 효과 가시화
// ============================================================
// 오늘 (2026-05-08) push 한 자동화 (광역 보도자료 4 layer fallback / dedupe 점진 도입 W1 /
// news cap 100 / apply_url prompt 강화) 의 1주 추세를 한 곳에서.
//
// 사장님이 매일 SMS 외에 1 click 으로 진입해 종합 효과 점검.
// 이상 신호 시 진단 도구 link 즉시 이동.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getOpsMonitorSnapshot, type DailyCount } from "@/lib/admin/ops-monitor";
import { SimpleBarChart } from "@/components/admin/trend-charts";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "운영 모니터링 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// DailyCount → DailyPoint 변환 (SimpleBarChart 가 기대하는 shape)
function toPoints(arr: DailyCount[]) {
  return arr.map((d) => ({ date: d.day, value: d.count }));
}

// KPI 카드 — health/press-ingest 페이지 스타일 일관
function Kpi({
  label,
  value,
  tone,
  hint,
  href,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
  hint?: string;
  href?: string;
}) {
  const cls =
    tone === "ok"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-grey-200 bg-grey-50 text-grey-700";
  const body = (
    <>
      <p className="text-xs font-semibold mb-0.5 tracking-[0.04em] uppercase">
        {label}
      </p>
      <p className="text-lg font-extrabold tracking-[-0.3px] leading-tight">
        {value}
      </p>
      {hint && <p className="text-xs mt-1 leading-[1.4]">{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`group block rounded-lg border p-3 no-underline hover:border-blue-400 hover:shadow-sm transition-all ${cls}`}
      >
        {body}
      </Link>
    );
  }
  return <div className={`rounded-lg border p-3 ${cls}`}>{body}</div>;
}

export default async function OpsMonitorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/ops-monitor");
  if (!isAdminUser(user.email)) redirect("/");

  const snap = await getOpsMonitorSnapshot();

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="운영 모니터링"
        description={
          <>
            2026-05-08 가동 자동화 (광역 보도자료 / dedupe 점진 / news cap / apply_url prompt) 7일 효과 종합.
            <br />
            <strong className="text-grey-900">매일 SMS 외 1 click 점검</strong> — 이상 신호 시 아래 진단 도구 link 클릭.
          </>
        }
      />

      <p className="text-xs text-grey-500 mb-5">
        갱신 시각: {snap.generatedAtKst}
      </p>

      {/* dedupe 점진 도입 W1~W4 효과 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          🔁 dedupe 점진 도입 효과 (현재 임계 {snap.dedupeThreshold})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Kpi
            label="현재 임계"
            value={snap.dedupeThreshold.toFixed(2)}
            tone={snap.dedupeThreshold < 0.95 ? "ok" : "muted"}
            hint={
              snap.dedupeThreshold === 0.95
                ? "default (env 미등록)"
                : "Vercel env DEDUPE_AUTO_CONFIRM_THRESHOLD"
            }
          />
          <Kpi
            label="7일 자동 confirm"
            value={`${snap.dedupeAutoConfirm7d.reduce((s, d) => s + d.count, 0)}건`}
            tone={
              snap.dedupeAutoConfirm7d.reduce((s, d) => s + d.count, 0) > 0
                ? "ok"
                : "muted"
            }
            hint="actor=null · 자동 처리"
          />
          <Kpi
            label="7일 사장님 reject"
            value={`${snap.dedupeReject7d.reduce((s, d) => s + d.count, 0)}건`}
            tone={
              snap.dedupeReject7d.reduce((s, d) => s + d.count, 0) >= 5
                ? "warn"
                : "muted"
            }
            hint={
              snap.dedupeReject7d.reduce((s, d) => s + d.count, 0) >= 5
                ? "rollback 신호 (≥5건)"
                : "임계 안전"
            }
            href="/admin/dedupe"
          />
        </div>
        <div className="bg-white rounded-2xl border border-grey-100 p-4">
          <SimpleBarChart
            title="dedupe 자동 confirm vs 사장님 reject (7일)"
            series={[
              {
                label: "자동 confirm",
                color: "#3182F6",
                data: toPoints(snap.dedupeAutoConfirm7d),
              },
              {
                label: "reject",
                color: "#F04452",
                data: toPoints(snap.dedupeReject7d),
              },
            ]}
          />
        </div>
      </section>

      {/* 광역 보도자료 4 layer fallback 효과 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          🤖 광역 보도자료 자동 confirm 효과 (4 layer fallback)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Kpi
            label="7일 자동 등록"
            value={`${snap.pressAutoConfirm7d.reduce((s, d) => s + d.count, 0)}건`}
            tone={
              snap.pressAutoConfirm7d.reduce((s, d) => s + d.count, 0) > 0
                ? "ok"
                : "muted"
            }
            hint="actor=null · 자동 confirm"
          />
          <Kpi
            label="광역 매핑 의존도"
            value={`${snap.pressProvincePct}%`}
            tone={
              snap.pressProvincePct >= 80
                ? "warn"
                : snap.pressProvincePct > 0
                  ? "ok"
                  : "muted"
            }
            hint={
              snap.pressProvincePct >= 80
                ? "LLM 추출률 ↓ — prompt 재검토"
                : "Layer 4 비율"
            }
            href="/admin/press-ingest"
          />
          <Kpi
            label="24h 미분류"
            value={`${snap.pressUnclassified24h}건`}
            tone={
              snap.pressUnclassified24h >= 30
                ? "warn"
                : snap.pressUnclassified24h > 0
                  ? "ok"
                  : "muted"
            }
            hint={
              snap.pressUnclassified24h >= 30
                ? "cron 가동 점검 (dashboard 알림 기준)"
                : "cron 분류 capacity 정상"
            }
            href="/admin/press-ingest"
          />
        </div>
        <div className="bg-white rounded-2xl border border-grey-100 p-4">
          <SimpleBarChart
            title="광역 보도자료 자동 등록 (7일)"
            series={[
              {
                label: "press_l2_confirm",
                color: "#03B26C",
                data: toPoints(snap.pressAutoConfirm7d),
              },
            ]}
          />
        </div>
      </section>

      {/* news cap 100 효과 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          📰 news 자동 모더레이션 효과 (cap {snap.newsCap})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Kpi
            label="cap / cron"
            value={`${snap.newsCap}건`}
            tone="ok"
            hint="3회/일 = 300건/일 capacity"
          />
          <Kpi
            label="7일 자동 hide"
            value={`${snap.newsAutoHide7d.reduce((s, d) => s + d.count, 0)}건`}
            tone={
              snap.newsAutoHide7d.reduce((s, d) => s + d.count, 0) > 0
                ? "ok"
                : "muted"
            }
            hint="actor=null · LLM 자동 hide"
          />
          <Kpi
            label="24h 미분류 backlog"
            value={`${snap.newsBacklog24h}건`}
            tone={
              snap.newsBacklog24h >= 50
                ? "warn"
                : snap.newsBacklog24h > 0
                  ? "ok"
                  : "muted"
            }
            hint={
              snap.newsBacklog24h >= 50
                ? "cap 추가 확대 검토"
                : "정상"
            }
            href="/admin/news"
          />
        </div>
        <div className="bg-white rounded-2xl border border-grey-100 p-4">
          <SimpleBarChart
            title="news 자동 hide (7일)"
            series={[
              {
                label: "auto_hide",
                color: "#A234C7",
                data: toPoints(snap.newsAutoHide7d),
              },
            ]}
          />
        </div>
      </section>

      {/* 운영 안정성 — cron 실패 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          🚨 운영 안정성 (cron 실패 7일)
        </h2>
        <div className="bg-white rounded-2xl border border-grey-100 p-4">
          <SimpleBarChart
            title="cron 실패 (7일)"
            series={[
              {
                label: "실패 row",
                color: "#F04452",
                data: toPoints(snap.cronFailures7d),
              },
            ]}
          />
        </div>
        <p className="text-xs text-grey-600 mt-2">
          ※ 일별 막대 1+ 면{" "}
          <Link
            href="/admin/cron-failures"
            className="text-blue-500 underline font-medium"
          >
            cron 실패 알림
          </Link>{" "}
          진입해 prefix 별 일괄 재시도.
        </p>
      </section>

      {/* 진단 도구 link */}
      <section className="mt-10 pt-8 border-t border-grey-200">
        <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          진단 도구
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DiagLink href="/admin/dedupe" label="dedupe 검수 큐" />
          <DiagLink href="/admin/press-ingest" label="광역 보도자료 후보" />
          <DiagLink href="/admin/news" label="뉴스 모더레이션" />
          <DiagLink href="/admin/cron-failures" label="cron 실패 알림" />
          <DiagLink href="/admin/health" label="헬스 대시보드" />
          <DiagLink href="/admin" label="← 어드민 홈" />
        </div>
      </section>
    </div>
  );
}

function DiagLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-lg border border-grey-200 p-3 text-sm font-semibold text-grey-900 hover:border-blue-300 hover:text-blue-600 no-underline transition-colors"
    >
      {label} →
    </Link>
  );
}
