// ============================================================
// /admin/cron-failures — cron 실패 알림 운영 가시화
// ============================================================
// 2026-04-26 ~04-27 enrich 알림 폭주 사고 후속.
// 사고 진단 시 cron_failure_log 를 SQL 직접 떠야만 봤던 정보를 페이지로.
//
// 표시 항목:
//   1. 24h KPI 카드 4종
//      · 신규 알림 (notified_at 24h 안 + first==notified)
//      · 누적 발생 occurrences 합 (24h 안 last_seen 된 row 의 occurrences 합)
//      · 활성 알림 종류 (24h 활동 row 수)
//      · 가장 시끄러운 prefix (occurrences 합 1위)
//   2. prefix 그룹 카드 (enrich/collect/finalize/cleanup/...)
//   3. 최근 알림 30건 테이블 (notified_at desc)
//
// 권한: ADMIN_EMAILS 가드. robots noindex.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "cron 실패 알림 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/cron-failures");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// jobName prefix 추출 — 첫 단어 (괄호·대괄호·공백 직전까지)
// 예) "enrich (cron) - Detail API 실패율 5/5" → "enrich"
//     "collect[bizinfo] - 일부 소스 실패"     → "collect"
//     "finalize-deletions (cron)"              → "finalize-deletions"
//     "cleanup-expired-programs"               → "cleanup-expired-programs"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractPrefix(jobName: string): string {
  const m = jobName.match(/^([^\s[(]+)/);
  return m ? m[1] : jobName.slice(0, 20);
}

type FailureRow = {
  id: number;
  job_name: string;
  signature: string;
  error_message: string;
  context: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  notified_at: string;
};

async function get24hFailures(): Promise<FailureRow[]> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("cron_failure_log")
    .select(
      "id, job_name, signature, error_message, context, first_seen_at, last_seen_at, occurrences, notified_at",
    )
    .gte("last_seen_at", since24h)
    .order("notified_at", { ascending: false })
    .limit(100);

  if (error) {
    console.warn("[admin/cron-failures] 조회 실패:", error.message);
    return [];
  }
  return (data ?? []) as FailureRow[];
}

// "방금 전", "5분 전" 상대 시각 — admin/page.tsx 와 동일 패턴
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function fmtKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
}

export default async function CronFailuresPage() {
  await requireAdmin();
  const rows = await get24hFailures();

  // KPI 집계 — JS 단으로 (24h 안 100건 이내라 부담 없음)
  const totalOccurrences = rows.reduce((s, r) => s + (r.occurrences ?? 0), 0);
  const newAlerts = rows.filter((r) => r.first_seen_at === r.notified_at).length;
  const activeKinds = rows.length;

  // prefix 그룹 집계
  const prefixMap = new Map<
    string,
    { occurrences: number; rows: number; newest: string }
  >();
  for (const r of rows) {
    const p = extractPrefix(r.job_name);
    const cur = prefixMap.get(p) ?? { occurrences: 0, rows: 0, newest: r.last_seen_at };
    cur.occurrences += r.occurrences ?? 0;
    cur.rows += 1;
    if (r.last_seen_at > cur.newest) cur.newest = r.last_seen_at;
    prefixMap.set(p, cur);
  }
  const prefixGroups = Array.from(prefixMap.entries())
    .map(([prefix, v]) => ({ prefix, ...v }))
    .sort((a, b) => b.occurrences - a.occurrences);
  const loudestPrefix = prefixGroups[0]?.prefix ?? "—";

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · cron
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            cron 실패 알림 (24시간)
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.65]">
            cron_failure_log 24h 활동 — 신규 알림·누적 발생·prefix 그룹·전체 목록.
            폭주 패턴 (같은 prefix 가 occurrences 가 비정상적으로 큼) 또는 신규
            jobName 출현을 빠르게 발견하기 위함입니다.
          </p>
        </div>

        {/* KPI 카드 4종 */}
        <section className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="신규 알림"
              value={newAlerts}
              suffix="건"
              hint="first==notified (신규 발생)"
              tone={newAlerts >= 3 ? "warn" : "neutral"}
            />
            <StatCard
              label="누적 발생"
              value={totalOccurrences}
              suffix="회"
              hint="occurrences 합 (dedupe 차단된 발생 포함)"
            />
            <StatCard
              label="활성 알림 종류"
              value={activeKinds}
              suffix="종"
              hint="24h 안 last_seen 된 row 수"
            />
            <StatCard
              label="가장 시끄러운 prefix"
              value={loudestPrefix}
              hint={`occurrences ${prefixGroups[0]?.occurrences ?? 0}회`}
            />
          </div>
        </section>

        {/* prefix 그룹 */}
        <section className="mb-8">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            prefix 그룹 ({prefixGroups.length}개)
          </h2>
          {prefixGroups.length === 0 ? (
            <p className="text-[13px] text-grey-600 py-4">
              최근 24시간 알림이 없습니다. 평온한 운영 상태 ✅
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prefixGroups.map((g) => (
                <div
                  key={g.prefix}
                  className="bg-white rounded-lg border border-grey-200 p-4"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-[14px] font-bold text-grey-900 font-mono">
                      {g.prefix}
                    </div>
                    <div className="text-[12px] text-grey-600">
                      {g.rows}종 · {fmtRelative(g.newest)}
                    </div>
                  </div>
                  <div className="text-[20px] font-extrabold text-grey-900 leading-none">
                    {g.occurrences.toLocaleString()}
                    <span className="text-[13px] font-semibold text-grey-600 ml-1">
                      회
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 전체 알림 목록 */}
        <section className="mb-8">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            최근 알림 ({rows.length}건)
          </h2>
          {rows.length === 0 ? (
            <p className="text-[13px] text-grey-600 py-4">표시할 알림이 없습니다.</p>
          ) : (
            <div className="bg-white rounded-lg border border-grey-200 overflow-hidden">
              <ul>
                {rows.map((r) => {
                  const isNew = r.first_seen_at === r.notified_at;
                  return (
                    <li
                      key={r.id}
                      className="px-4 py-3 border-b border-grey-100 last:border-b-0"
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <div className="text-[13px] font-semibold text-grey-900 truncate min-w-0 flex-1">
                          {isNew && (
                            <span className="inline-block bg-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 align-middle">
                              NEW
                            </span>
                          )}
                          {r.job_name}
                        </div>
                        <div className="text-[12px] text-grey-600 whitespace-nowrap">
                          {fmtRelative(r.notified_at)}
                        </div>
                      </div>
                      <div className="text-[12px] text-grey-700 leading-[1.55] break-words">
                        {r.error_message}
                      </div>
                      <div className="text-[11px] text-grey-600 mt-1 leading-[1.5]">
                        occurrences <strong>{r.occurrences}</strong> · first{" "}
                        {fmtKst(r.first_seen_at)} · last {fmtKst(r.last_seen_at)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* 운영 메모 */}
        <section className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8 text-[13px] text-grey-800 leading-[1.7]">
          <p className="font-bold mb-1.5">운영 가이드</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>NEW</strong> 배지 = first_seen_at == notified_at — 처음 발생해
              메일이 발송된 알림. 같은 signature 라도 24h 후 다시 발송될 때마다 NEW.
            </li>
            <li>
              <strong>occurrences</strong> 가 1보다 크면 dedupe 가 정상 작동하는
              증거 — 메일은 1번만 갔지만 실제 실패는 N번 누적된 상태.
            </li>
            <li>
              같은 prefix 의 jobName 변형이 갑자기 5개+ 늘면 makeFailureSignature
              normalize 누락 의심 (2026-04-27 사고 패턴).
            </li>
          </ul>
        </section>

        <p className="text-[13px] flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
          <Link
            href="/admin/enrich-detail"
            className="text-blue-500 font-medium underline"
          >
            공고 상세 보강 →
          </Link>
        </p>
      </div>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatCard({
  label,
  value,
  suffix,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  tone?: "neutral" | "warn";
}) {
  const border = tone === "warn" ? "border-red/30 bg-red/5" : "border-grey-200 bg-white";
  const hintColor = tone === "warn" ? "text-red font-semibold" : "text-grey-600";
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <div className="text-[12px] font-semibold tracking-[0.08em] text-grey-700 uppercase mb-1">
        {label}
      </div>
      <div className="text-[22px] font-extrabold text-grey-900 leading-none">
        {display}
        {suffix && (
          <span className="text-[13px] font-semibold text-grey-600 ml-1">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <div className={`text-[12px] mt-1.5 leading-[1.45] ${hintColor}`}>
          {hint}
        </div>
      )}
    </div>
  );
}
