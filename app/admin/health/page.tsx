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
  const snap = await getHealthSnapshot();

  // 이상 신호 카운트 — 페이지 상단 요약
  const allItems = [...snap.db, ...snap.cron, ...snap.env, ...snap.users];
  const errorCount = allItems.filter((i) => i.status === "error").length;
  const warnCount = allItems.filter((i) => i.status === "warn").length;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · 헬스 대시보드
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            사이트 헬스 한눈에
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            매일 첫 페이지로 — 이상 신호 즉시 가시화. DB·cron·환경변수·사용자 한 곳에.
          </p>
        </div>

        {/* 이상 신호 요약 배너 */}
        <SummaryBanner errorCount={errorCount} warnCount={warnCount} />

        {/* DB 헬스 */}
        <Section title="📊 DB 콘텐츠" items={snap.db} />

        {/* Cron 헬스 */}
        <Section title="⏰ Cron 헬스" items={snap.cron} />

        {/* 사용자 헬스 */}
        <Section title="👥 사용자 활동" items={snap.users} />

        {/* 환경변수 */}
        <Section title="🔐 환경변수" items={snap.env} />

        {/* 빠른 액션 */}
        <section className="mt-10 pt-8 border-t border-grey-200">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
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
    </main>
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
        <p className="text-[14px] font-bold text-green">✅ 모두 정상</p>
        <p className="text-[12px] text-grey-700 mt-1">
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
        className={`text-[14px] font-bold ${
          errorCount > 0 ? "text-red" : "text-amber-700"
        }`}
      >
        {errorCount > 0 ? "❌" : "⚠️"} 이상 신호 {errorCount + warnCount}건
      </p>
      <p className="text-[12px] text-grey-700 mt-1">
        오류 {errorCount}건 · 주의 {warnCount}건. 아래 항목 확인.
      </p>
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
      <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
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
  return (
    <div className={`rounded-lg border p-3 ${colors[item.status]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${dot[item.status]}`}
          aria-hidden="true"
        />
        <div className="text-[12px] font-semibold tracking-[0.04em] text-grey-700 truncate">
          {item.label}
        </div>
      </div>
      <div className="text-[16px] font-extrabold leading-tight tracking-[-0.2px]">
        {item.value}
      </div>
      {item.hint && (
        <div className="text-[11px] mt-1 leading-[1.4] text-grey-600">
          {item.hint}
        </div>
      )}
    </div>
  );
}

function DiagLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-lg border border-grey-200 p-3 text-[13px] font-semibold text-grey-900 hover:border-blue-300 hover:text-blue-600 no-underline transition-colors"
    >
      {label} →
    </Link>
  );
}
