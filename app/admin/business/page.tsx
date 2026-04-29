// ============================================================
// /admin/business — 자영업자 wedge dogfood 통계 (KPI + 필드 입력률 + 분포)
// ============================================================
// 자영업자 자격 진단 wedge (마이그레이션 055) 출시 후 효과 가시화.
// - KPI 4종: 총 입력자 / 7d 신규 / 30d 신규 / 자영업자 → wedge 진입 전환율
// - 필드 입력률: industry / revenue_scale / employee_count / business_type / 등 채움률
// - 분포: industry · business_type
// - 최근 입력자 5건 (이메일 마스킹 + 요약)
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import {
  BUSINESS_INDUSTRY_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
} from "@/lib/profile-options";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "자영업자 wedge | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/business");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// 라벨 매핑 — 영문 enum value → 한국어 라벨
const INDUSTRY_LABEL: Record<string, string> = Object.fromEntries(
  BUSINESS_INDUSTRY_OPTIONS.map((o) => [o.value, o.label]),
);
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

type BusinessRow = {
  user_id: string;
  industry: string | null;
  revenue_scale: string | null;
  employee_count: string | null;
  business_type: string | null;
  established_date: string | null;
  region: string | null;
  district: string | null;
  created_at: string;
};

// 이메일 마스킹 — keeper@example.com → keep***@example.com
function maskEmail(email: string | null | undefined): string {
  if (!email) return "(이메일 없음)";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(4, local.length));
  return `${visible}***@${domain}`;
}

// "방금 전" / "5분 전" / "3시간 전" — admin/page.tsx 와 동일 패턴
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

// ━━━ 통계 수집 ━━━
async function getStats() {
  const admin = createAdminClient();
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 전체 행은 분포·필드 입력률 계산용으로도 필요 → 한 번만 fetch
  const [
    { count: totalCount },
    { count: new7dCount },
    { count: new30dCount },
    { data: occupSelfEmps },
    { data: allRows },
  ] = await Promise.all([
    admin.from("business_profiles").select("*", { count: "exact", head: true }),
    admin
      .from("business_profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since7d),
    admin
      .from("business_profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since30d),
    // 자영업자 occupation 사용자 user_id 목록 — wedge 전환율 계산용.
    // 사장님 운영 규모 (~수백명) 에서 안전. 늘어나면 SQL count + EXISTS 로 전환.
    admin.from("user_profiles").select("id").eq("occupation", "자영업자"),
    admin
      .from("business_profiles")
      .select(
        "user_id, industry, revenue_scale, employee_count, business_type, established_date, region, district, created_at",
      )
      .order("created_at", { ascending: false }),
  ]);

  const rows: BusinessRow[] = (allRows ?? []) as BusinessRow[];
  const total = totalCount ?? 0;

  // 자영업자 occupation 사용자 중 business_profiles 입력 사용자 비율
  const selfEmpIds = new Set((occupSelfEmps ?? []).map((u) => u.id));
  const enteredFromSelfEmp = rows.filter((r) => selfEmpIds.has(r.user_id)).length;
  const selfEmpTotal = selfEmpIds.size;
  const conversionPct =
    selfEmpTotal > 0 ? Math.round((enteredFromSelfEmp / selfEmpTotal) * 100) : 0;

  // 필드 입력률 — established_date 는 string null 체크. 나머지는 enum 값.
  function fillRate(field: keyof BusinessRow): number {
    if (total === 0) return 0;
    const filled = rows.filter((r) => r[field] != null && r[field] !== "").length;
    return Math.round((filled / total) * 100);
  }

  // 분포 — industry / business_type 별 카운트 (null 은 "미입력" 으로 모음)
  function countBy(field: "industry" | "business_type"): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const k = r[field] ?? "(미입력)";
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  return {
    total,
    new7d: new7dCount ?? 0,
    new30d: new30dCount ?? 0,
    selfEmpTotal,
    enteredFromSelfEmp,
    conversionPct,
    fields: {
      industry: fillRate("industry"),
      revenue_scale: fillRate("revenue_scale"),
      employee_count: fillRate("employee_count"),
      business_type: fillRate("business_type"),
      established_date: fillRate("established_date"),
      region: fillRate("region"),
    },
    industryDist: countBy("industry"),
    typeDist: countBy("business_type"),
    recent: rows.slice(0, 5),
  };
}

// 최근 5건 사용자 이메일 N+1 조회 (5건만이라 감수)
async function fetchEmails(userIds: string[]): Promise<Record<string, string | null>> {
  const admin = createAdminClient();
  const out: Record<string, string | null> = {};
  for (const id of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      out[id] = data?.user?.email ?? null;
    } catch {
      out[id] = null;
    }
  }
  return out;
}

export default async function BusinessAdminPage() {
  await requireAdmin();
  const stats = await getStats();
  const emails = await fetchEmails(stats.recent.map((r) => r.user_id));

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
        <AdminPageHeader
          kicker="ADMIN · 지표·분석"
          title="자영업자 자격 진단 dogfood"
          description="business_profiles 테이블 입력 현황과 wedge 효과 측정 (마이그레이션 055)"
        />

        {/* KPI 카드 4종 */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            wedge 진입 지표
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="총 입력자" value={stats.total} suffix="명" />
            <StatCard label="최근 7일 신규" value={stats.new7d} suffix="명" />
            <StatCard label="최근 30일 신규" value={stats.new30d} suffix="명" />
            <StatCard
              label="자영업자 wedge 전환율"
              value={stats.conversionPct}
              suffix="%"
              hint={`${stats.enteredFromSelfEmp.toLocaleString()} / ${stats.selfEmpTotal.toLocaleString()} 명`}
            />
          </div>
        </section>

        {/* 필드 입력률 */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            필드 입력률
          </h2>
          <div className="bg-white border border-grey-200 rounded-lg p-5">
            {stats.total === 0 ? (
              <p className="text-sm text-grey-600">아직 입력된 데이터가 없어요.</p>
            ) : (
              <ul className="space-y-3">
                {Object.entries(stats.fields).map(([field, pct]) => (
                  <li key={field}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-semibold text-grey-700">
                        {FIELD_LABEL[field] ?? field}
                      </span>
                      <span className="text-sm font-bold text-grey-900">{pct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-grey-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 분포 2종 */}
        <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          <DistPanel title="업종 분포" dist={stats.industryDist} labels={INDUSTRY_LABEL} />
          <DistPanel title="사업자 유형" dist={stats.typeDist} labels={TYPE_LABEL} />
        </section>

        {/* 최근 입력자 5건 */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            최근 입력자 {stats.recent.length}명
          </h2>
          <div className="bg-white border border-grey-200 rounded-lg p-5">
            {stats.recent.length === 0 ? (
              <p className="text-sm text-grey-600">아직 입력자가 없어요.</p>
            ) : (
              <ul className="space-y-2">
                {stats.recent.map((r) => (
                  <li
                    key={r.user_id}
                    className="flex items-center justify-between gap-3 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-grey-900 truncate">
                        {maskEmail(emails[r.user_id])}
                      </div>
                      <div className="text-xs text-grey-600 leading-[1.5]">
                        {[
                          INDUSTRY_LABEL[r.industry ?? ""] ?? null,
                          TYPE_LABEL[r.business_type ?? ""] ?? null,
                          r.region,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "필드 미입력"}
                        {" · "}
                        {fmtRelative(r.created_at)}
                      </div>
                    </div>
                    <Link
                      href={`/admin/users/${r.user_id}`}
                      className="text-xs font-medium text-blue-500 hover:underline whitespace-nowrap"
                    >
                      상세 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

// ━━━ 작은 컴포넌트 ━━━

const FIELD_LABEL: Record<string, string> = {
  industry: "업종",
  revenue_scale: "매출 규모",
  employee_count: "상시근로자 수",
  business_type: "사업자 유형",
  established_date: "사업자등록일",
  region: "사업장 지역",
};

function StatCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-grey-200 bg-white p-4">
      <div className="text-xs font-semibold tracking-[0.08em] text-grey-700 uppercase mb-1">
        {label}
      </div>
      <div className="text-2xl font-extrabold text-grey-900 leading-none">
        {value.toLocaleString()}
        {suffix && (
          <span className="text-sm font-semibold text-grey-600 ml-1">{suffix}</span>
        )}
      </div>
      {hint && <div className="text-xs mt-1.5 leading-[1.45] text-grey-600">{hint}</div>}
    </div>
  );
}

function DistPanel({
  title,
  dist,
  labels,
}: {
  title: string;
  dist: Record<string, number>;
  labels: Record<string, string>;
}) {
  // 카운트 내림차순 정렬, 0 인 항목은 제외
  const entries = Object.entries(dist)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? Math.max(...entries.map(([, n]) => n)) : 0;

  return (
    <section className="bg-white border border-grey-200 rounded-lg p-5">
      <h3 className="text-sm font-bold text-grey-900 mb-3 tracking-[-0.2px]">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-grey-600">아직 데이터 없음</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([key, n]) => {
            const label = labels[key] ?? key;
            const pct = max > 0 ? Math.round((n / max) * 100) : 0;
            return (
              <li key={key}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-grey-700">{label}</span>
                  <span className="text-sm font-bold text-grey-900">
                    {n.toLocaleString()}명
                  </span>
                </div>
                <div className="w-full h-1.5 bg-grey-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
