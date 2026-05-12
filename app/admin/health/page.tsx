// ============================================================
// /admin/health — 통합 헬스 dashboard
// ============================================================
// 매일 첫 페이지로 사용. DB·cron·콘텐츠·환경변수·활성 사용자 한곳에.
// 운영 부담 ↓. 이상 신호 (cron 실패·환경변수 누락·blog 발행 0) 즉시 가시화.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getHealthSnapshot, type HealthCheckItem } from "@/lib/admin-health";
// Phase 6 — 임계치 alert + 30일 추세 차트 추가
import { getHealthSignals, checkThresholds } from "@/lib/health-check";
import { getAdminTrends } from "@/lib/admin-trends";
import { getFunnelHealthSnapshot } from "@/lib/funnel-health";
// Phase 6 후속 #13 — 데이터 일관성 모니터링 (orphan FK / 만료 cron)
import { getDataIntegritySnapshot } from "@/lib/admin-data-integrity";
import {
  SimpleBarChart,
  SimpleLineChart,
} from "@/components/admin/trend-charts";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "헬스 대시보드 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/health");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminHealthPage() {
  await requireAdmin();
  // Phase 6 — 기존 health snapshot + 신규 임계치 신호·30일 추세 + 데이터 일관성 병렬 fetch
  const [snap, signals, trends, integrity, funnel] = await Promise.all([
    getHealthSnapshot(),
    getHealthSignals(),
    getAdminTrends(),
    getDataIntegritySnapshot(),
    getFunnelHealthSnapshot(),
  ]);
  const thresholdAlerts = checkThresholds(signals);

  // 이상 신호 카운트 — 페이지 상단 요약 (integrity 도 합산)
  const allItems = [
    ...snap.db,
    ...snap.cron,
    ...snap.env,
    ...snap.users,
    ...integrity,
  ];
  const errorCount = allItems.filter((i) => i.status === "error").length;
  const warnCount = allItems.filter((i) => i.status === "warn").length;

  return (
    <div className="max-w-[980px]">
      {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="사이트 헬스 한눈에"
        description="매일 첫 페이지로 — 이상 신호 즉시 가시화. DB·cron·환경변수·사용자 한 곳에."
      />

      {/* 이상 신호 요약 배너 */}
      <SummaryBanner errorCount={errorCount} warnCount={warnCount} />

      <FunnelHealthSection snapshot={funnel} />

      {/* Phase 6 — 임계치 alert (가입 0·결제 실패·cron 연속 실패) */}
      {thresholdAlerts.length > 0 && (
        <section className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-red-900 mb-3">
            ⚠️ 임계치 {thresholdAlerts.length}건 초과
          </h2>
          <ul className="text-sm text-red-800 space-y-1">
            {thresholdAlerts.map((a) => (
              <li key={a.key}>• {a.message}</li>
            ))}
          </ul>
          <p className="text-xs text-red-700 mt-3">
            매일 09:00 KST cron `/api/cron/health-alert` 가 같은 임계치 점검 후 사장님 이메일 발송.
          </p>
        </section>
      )}

      {/* DB 헬스 */}
      <Section title="📊 DB 콘텐츠" items={snap.db} />

      {/* Cron 헬스 */}
      <Section title="⏰ Cron 헬스" items={snap.cron} />

      {/* 사용자 헬스 */}
      <Section title="👥 사용자 활동" items={snap.users} />

      {/* 환경변수 */}
      <Section title="🔐 환경변수" items={snap.env} />

      {/* 인스타 자동 발행 OAuth 상태 — 2026-05-12 추가 */}
      <section className="mb-8 bg-white border border-grey-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          📸 인스타 자동 발행 OAuth
        </h2>
        {signals.instagramTokenExpiresInDays === null ? (
          <div className="text-sm text-grey-600">
            ⚠️ OAuth 미연결 —{" "}
            <Link
              href="/admin/instagram"
              className="text-blue-600 underline underline-offset-2"
            >
              /admin/instagram
            </Link>{" "}
            에서 연결 (cron graceful skip 중)
          </div>
        ) : signals.instagramTokenExpiresInDays < 0 ? (
          <div className="text-sm text-red-700 font-semibold">
            ❌ 토큰 이미 만료 ({Math.abs(signals.instagramTokenExpiresInDays)}일
            전) — 자동 발행 중단됨. 재연결 필요.
          </div>
        ) : signals.instagramTokenExpiresInDays <= 7 ? (
          <div className="text-sm text-orange-700">
            ⚠️ 토큰 만료 {signals.instagramTokenExpiresInDays}일 남음 (자동
            refresh 임박)
          </div>
        ) : (
          <div className="text-sm text-grey-700">
            ✅ 정상 (토큰 만료까지 {signals.instagramTokenExpiresInDays}일)
          </div>
        )}
        <p className="text-xs text-grey-500 mt-2 leading-relaxed">
          매시 정각 cron (KST 09~22, 첫 7일 5건 → 이후 14건/일). 만료 7일 전
          자동 refresh. 발행 결과는{" "}
          <Link
            href="/admin/instagram"
            className="text-blue-600 underline underline-offset-2"
          >
            /admin/instagram
          </Link>
          .
        </p>
      </section>

      {/* 네이버 RPA cookies 상태 — 2026-05-12 추가 */}
      <section className="mb-8 bg-white border border-grey-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          🟢 네이버 RPA cookies
        </h2>
        {signals.naverCookiesExpiresInDays === null ? (
          <div className="text-sm text-grey-600">
            ⚠️ cookies 미업로드 —{" "}
            <Link
              href="/admin/naver-blog/cookies"
              className="text-blue-600 underline underline-offset-2"
            >
              /admin/naver-blog/cookies
            </Link>{" "}
            에서 업로드 (cron graceful skip 중)
          </div>
        ) : signals.naverCookiesExpiresInDays < 0 ? (
          <div className="text-sm text-red-700 font-semibold">
            ❌ cookies 이미 만료 ({Math.abs(signals.naverCookiesExpiresInDays)}일
            전) — 자동 발행 중단됨. 재업로드 필요.
          </div>
        ) : signals.naverCookiesExpiresInDays <= 7 ? (
          <div className="text-sm text-orange-700">
            ⚠️ cookies 만료 {signals.naverCookiesExpiresInDays}일 남음 — Chrome
            재로그인 후 재업로드 권장
          </div>
        ) : (
          <div className="text-sm text-grey-700">
            ✅ 정상 (cookies 만료까지 {signals.naverCookiesExpiresInDays}일)
          </div>
        )}
        <p className="text-xs text-grey-500 mt-2 leading-relaxed">
          매 3시간 cron (KST 09:30~21:30, 첫 7일 3건 → 이후 7건/일). 자동
          refresh 불가 — 사장님 수동 cookies export 필요. 검증·발행은{" "}
          <Link
            href="/admin/naver-blog/manual-test"
            className="text-blue-600 underline underline-offset-2"
          >
            /admin/naver-blog/manual-test
          </Link>
          .
        </p>
      </section>

      {/* 데이터 일관성 (#13) — orphan FK · 만료 cron 미처리 */}
      <Section title="🔗 데이터 일관성" items={integrity} />

      {/* Phase 6 — 30일 추세 차트 (DAU·구독·콘텐츠) */}
      <section className="mt-10 pt-8 border-t border-grey-200">
        <h2 className="text-base font-bold text-grey-900 mb-4 tracking-[-0.3px]">
          📈 30일 추세
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleLineChart title="DAU (일별 로그인)" data={trends.dau} />
          </div>
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleBarChart
              title="구독 신규 / 취소"
              series={[
                { label: "신규", color: "#3182F6", data: trends.subscriptionsNew },
                { label: "취소", color: "#F04452", data: trends.subscriptionsCancelled },
              ]}
            />
          </div>
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleBarChart
              title="블로그 발행"
              series={[
                { label: "blog", color: "#03B26C", data: trends.blogPublished },
              ]}
            />
          </div>
          <div className="bg-white rounded-2xl border border-grey-100 p-4">
            <SimpleBarChart
              title="뉴스 수집"
              series={[
                { label: "news", color: "#A234C7", data: trends.newsCollected },
              ]}
            />
          </div>
        </div>
      </section>

      {/* 빠른 액션 */}
      <section className="mt-10 pt-8 border-t border-grey-200">
        <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          진단 페이지
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DiagLink href="/admin/cron-failures" label="cron 실패 로그" />
          <DiagLink href="/admin/alimtalk" label="알림톡 운영" />
          <DiagLink href="/admin/news" label="뉴스 수집 점검" />
          <DiagLink href="/admin/enrich-detail" label="공고 상세 보강" />
          <DiagLink href="/admin/targeting" label="본문 분석 진행률" />
          <DiagLink href="/admin" label="← 어드민 홈" />
        </div>
      </section>
    </div>
  );
}

function SummaryBanner({
  errorCount,
  warnCount,
}: {
  errorCount: number;
  warnCount: number;
}) {
  if (errorCount === 0 && warnCount === 0) {
    return (
      <div className="rounded-lg border bg-green/10 border-green/30 p-4 mb-6">
        <p className="text-sm font-bold text-green">✅ 모두 정상</p>
        <p className="text-xs text-grey-700 mt-1">
          이상 신호 없음. 운영 안정 상태.
        </p>
      </div>
    );
  }
  return (
    <div
      className={`rounded-lg border p-4 mb-6 ${
        errorCount > 0
          ? "bg-red/10 border-red/30"
          : "bg-amber-50 border-amber-200"
      }`}
    >
      <p
        className={`text-sm font-bold ${
          errorCount > 0 ? "text-red" : "text-amber-700"
        }`}
      >
        {errorCount > 0 ? "❌" : "⚠️"} 이상 신호 {errorCount + warnCount}건
      </p>
      <p className="text-xs text-grey-700 mt-1">
        오류 {errorCount}건 · 주의 {warnCount}건. 아래 항목 확인.
      </p>
    </div>
  );
}

function FunnelHealthSection({
  snapshot,
}: {
  snapshot: Awaited<ReturnType<typeof getFunnelHealthSnapshot>>;
}) {
  const summaryTone =
    snapshot.summary.tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-green/30 bg-green/5 text-green";

  return (
    <section className="mb-6">
      <div className={`rounded-xl border p-4 mb-3 ${summaryTone}`}>
        <h2 className="text-sm font-bold mb-1">가입 funnel</h2>
        <p className="text-xs leading-[1.5]">{snapshot.summary.message}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {snapshot.metrics.map((metric) => (
          <FunnelMetricCard key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function FunnelMetricCard({
  metric,
}: {
  metric: Awaited<
    ReturnType<typeof getFunnelHealthSnapshot>
  >["metrics"][number];
}) {
  const colors = {
    ok: "border-green/30 bg-green/5",
    warn: "border-amber-200 bg-amber-50",
    info: "border-grey-200 bg-white",
  } as const;
  const valueText =
    metric.key === "active_7d"
      ? `${metric.value7d.toLocaleString()}명`
      : `${metric.value24h.toLocaleString()}건`;

  return (
    <div className={`rounded-lg border p-3 ${colors[metric.tone]}`}>
      <div className="text-xs font-semibold tracking-[0.04em] text-grey-700 truncate">
        {metric.label}
      </div>
      <div className="text-base font-extrabold leading-tight tracking-[-0.2px] mt-1 text-grey-900">
        {valueText}
      </div>
      <div className="text-xs mt-1 leading-[1.4] text-grey-600">
        7d {metric.value7d.toLocaleString()}
        {metric.key === "active_7d" ? "명" : "건"} · {metric.hint}
      </div>
      {metric.conversionLabel && (
        <div className="text-xs mt-2 font-semibold text-grey-800">
          {metric.conversionLabel}:{" "}
          {metric.conversionRate === null
            ? "모수 없음"
            : `${metric.conversionRate}%`}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: HealthCheckItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        {title}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((item, i) => (
          <ItemCard key={`${title}-${i}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function ItemCard({ item }: { item: HealthCheckItem }) {
  const colors = {
    ok: "border-green/30 bg-green/5 text-grey-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red/30 bg-red/5 text-red",
    info: "border-grey-200 bg-white text-grey-900",
  } as const;
  const dot = {
    ok: "bg-green",
    warn: "bg-amber-500",
    error: "bg-red",
    info: "bg-grey-400",
  } as const;

  // 카드 본체 — href 유무에 무관한 공통 레이아웃.
  const body = (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${dot[item.status]}`}
          aria-hidden="true"
        />
        <div className="text-xs font-semibold tracking-[0.04em] text-grey-700 truncate">
          {item.label}
        </div>
        {item.href && (
          <span
            className="ml-auto text-xs text-grey-500 group-hover:text-blue-600"
            aria-hidden="true"
          >
            →
          </span>
        )}
      </div>
      <div className="text-base font-extrabold leading-tight tracking-[-0.2px]">
        {item.value}
      </div>
      {item.hint && (
        <div className="text-xs mt-1 leading-[1.4] text-grey-600">
          {item.hint}
        </div>
      )}
    </>
  );

  // href 있는 항목 — Link 로 감싸 클릭 시 진단 페이지 즉시 이동.
  // 사장님이 health 페이지에서 이상 신호 카드 클릭만으로 처리 도구 진입 가능.
  if (item.href) {
    return (
      <Link
        href={item.href}
        className={`group block rounded-lg border p-3 no-underline hover:border-blue-400 hover:shadow-sm transition-all ${colors[item.status]}`}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={`rounded-lg border p-3 ${colors[item.status]}`}>
      {body}
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
