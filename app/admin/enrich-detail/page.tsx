// ============================================================
// /admin/enrich-detail — 공고 상세 API 수동 보강 도구
// ============================================================
// 기본적으론 cron (매일 6회, 00/03/11/15/19/23 UTC) 이 자동 돌지만,
// 사장님이 "지금 당장 더 채우고 싶다" 할 때 직접 버튼 눌러 10건 즉시 처리.
//
// 동작:
//   - 상단 카드 4개: 전체 / 채워짐 / 남음 / 실패 (bokjiro + local-welfare 기준)
//   - [지금 10건 보강] 버튼 → server action → /api/enrich 자체 POST
//   - 결과를 searchParams 로 받아 하단 배너로 표시
//   - admin_actions 에 enrich_detail_manual 로 감사 로그 기록
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "공고 상세 보강 | 어드민",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/enrich-detail");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// 상태 카운트 조회. bokjiro 관련 (중앙 + 지자체 local-welfare) 만.
// head:true + count:'exact' 로 row 데이터 전송 없이 count 만 받음 — 5912 row
// 전체를 네트워크로 끌어오던 코드리뷰 지적 반영.
//
// 058: skipped (영구 skip 도장) 도 추가 — welfare + loan 양쪽 합산.
// 영구 skip 카드는 reset 버튼 활성화 조건 + 사장님 운영 가시성 동시 충족.
async function getStats() {
  const admin = createAdminClient();
  const bokjiroCond = "source_code.eq.bokjiro,source_code.eq.local-welfare";

  const [total, fetched, failed, welfareSkipped, loanSkipped] = await Promise.all([
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .or(bokjiroCond),
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .or(bokjiroCond)
      .not("last_detail_fetched_at", "is", null),
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .or(bokjiroCond)
      .not("last_detail_failed_at", "is", null)
      .is("last_detail_fetched_at", null),
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .not("detail_permanently_skipped_at", "is", null),
    admin
      .from("loan_programs")
      .select("id", { count: "exact", head: true })
      .not("detail_permanently_skipped_at", "is", null),
  ]);

  const total_n = total.count ?? 0;
  const fetched_n = fetched.count ?? 0;
  const failed_n = failed.count ?? 0;
  const skipped_n = (welfareSkipped.count ?? 0) + (loanSkipped.count ?? 0);
  const pending_n = Math.max(0, total_n - fetched_n - failed_n);
  return {
    total: total_n,
    fetched: fetched_n,
    pending: pending_n,
    failed: failed_n,
    skipped: skipped_n,
  };
}

// 수동 trigger server action — self-POST 로 /api/enrich 호출
async function triggerEnrich(): Promise<void> {
  "use server";
  const user = await requireAdmin();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    redirect("/admin/enrich-detail?error=" + encodeURIComponent("CRON_SECRET 환경변수 누락"));
  }

  let result: Record<string, unknown> = {};
  let ok = false;
  try {
    const res = await fetch(`${siteUrl}/api/enrich`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    result = await res.json();
    ok = res.ok;
  } catch (err) {
    result = { error: err instanceof Error ? err.message : "알 수 없는 오류" };
  }

  try {
    await logAdminAction({
      actorId: user.id,
      action: "enrich_detail_manual",
      details: { ok, ...result },
    });
  } catch {
    // 감사 로그 실패해도 수동 trigger 자체는 기록 (사용자에 결과 표시)
  }

  const qs = `ok=${ok ? "1" : "0"}&result=${encodeURIComponent(JSON.stringify(result))}`;
  redirect(`/admin/enrich-detail?${qs}`);
}

// 058: 영구 skip 도장 일괄 해제. 외부 API 회복 시 사장님 1클릭 재시도 진입점.
// detail_permanently_skipped_at 만 NULL 로 되돌리면 picker 가 다시 후보로 인식.
// detail_failed_count·last_detail_failed_at 도 함께 reset 해서 7d cooldown 도 끊음
// → 다음 cron 즉시 재시도 가능 (외부 회복 검증 워크플로 단순화).
async function resetPermanentSkips(): Promise<void> {
  "use server";
  const user = await requireAdmin();
  const admin = createAdminClient();

  // 양쪽 테이블 동시 reset. .not + .select('id') count 로 영향 row 수 측정 후 update.
  const [wRes, lRes] = await Promise.all([
    admin
      .from("welfare_programs")
      .update({
        detail_permanently_skipped_at: null,
        detail_failed_count: 0,
        last_detail_failed_at: null,
      })
      .not("detail_permanently_skipped_at", "is", null)
      .select("id"),
    admin
      .from("loan_programs")
      .update({
        detail_permanently_skipped_at: null,
        detail_failed_count: 0,
        last_detail_failed_at: null,
      })
      .not("detail_permanently_skipped_at", "is", null)
      .select("id"),
  ]);

  const welfareReset = wRes.data?.length ?? 0;
  const loanReset = lRes.data?.length ?? 0;
  const errorMsg = wRes.error?.message || lRes.error?.message || null;

  try {
    await logAdminAction({
      actorId: user.id,
      action: "enrich_detail_skip_reset",
      details: {
        welfare_reset: welfareReset,
        loan_reset: loanReset,
        error: errorMsg,
      },
    });
  } catch {
    // 감사 로그 실패해도 reset 결과는 사용자에게 표시
  }

  if (errorMsg) {
    redirect(`/admin/enrich-detail?error=${encodeURIComponent(`reset 실패: ${errorMsg}`)}`);
  }
  const total = welfareReset + loanReset;
  redirect(
    `/admin/enrich-detail?reset=${total}&w=${welfareReset}&l=${loanReset}`,
  );
}

export default async function EnrichDetailPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    result?: string;
    error?: string;
    reset?: string;
    w?: string;
    l?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const stats = await getStats();

  // 결과 파싱 (URL 에서 받은 것)
  let resultObj: Record<string, unknown> | null = null;
  if (params.result) {
    try {
      resultObj = JSON.parse(decodeURIComponent(params.result));
    } catch {
      resultObj = { raw: params.result };
    }
  }
  const resultOk = params.ok === "1";

  // 058 reset 결과 — ?reset=N&w=X&l=Y 로 도착
  const resetTotal = params.reset ? Number(params.reset) : null;
  const resetWelfare = params.w ? Number(params.w) : 0;
  const resetLoan = params.l ? Number(params.l) : 0;

  const pct =
    stats.total > 0 ? Math.round((stats.fetched / stats.total) * 1000) / 10 : 0;

  return (
    <div className="max-w-[720px]">
      {/* 표준 헤더 슬롯 — F4 후속 마이그레이션 */}
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="공고 상세 수동 보강"
        description={
          <>
            cron (매일 6회, 하루 60건) 이 자동 처리하지만, 지금 즉시 10건 추가
            처리가 필요할 때 쓰세요.
            <br />
            <strong className="text-grey-900">[지금 10건 보강 실행 ↗] 클릭 시 새 탭에서 진행</strong> — 약 40초 소요.
            data.go.kr 개발계정 일일 할당량 100회 중 cron 이 60회 사용하니 수동 trigger 는 하루 3~4회 여유.
          </>
        }
      />

      {/* 상태 카드 (058: 영구 skip 카드 추가) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <StatCard label="전체" value={stats.total.toLocaleString()} />
        <StatCard label="채워짐" value={stats.fetched.toLocaleString()} hint={`${pct}%`} />
        <StatCard label="남음" value={stats.pending.toLocaleString()} />
        <StatCard label="실패" value={stats.failed.toLocaleString()} danger />
        <StatCard
          label="영구 skip"
          value={stats.skipped.toLocaleString()}
          hint="3회 연속 실패"
          danger={stats.skipped > 0}
        />
      </div>

      {/* 에러 — 빨강 강조 */}
      {params.error && (
        <div role="alert" className="bg-red/10 border-2 border-red rounded-lg p-4 text-sm text-red mb-4">
          ❌ {params.error}
        </div>
      )}

      {/* 실행 결과 — 강한 시각·timestamp·자세히 토글·닫기 버튼 (cron-trigger 패턴) */}
      {resultObj && (
        <div
          role="status"
          className={`rounded-xl p-5 mb-6 border-2 shadow-sm ${
            resultOk
              ? "bg-green/10 border-green text-grey-900"
              : "bg-red/10 border-red text-red"
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-lg font-extrabold mb-1">
                {resultOk ? "✅ 보강 실행 완료" : "❌ 보강 실행 실패"}
              </div>
              <div className="text-sm text-grey-700">
                /api/enrich · 약 40초 소요
              </div>
              <div className="text-xs text-grey-600 mt-1">
                {new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </div>
            </div>
            <Link
              href="/admin/enrich-detail"
              className="shrink-0 px-3 py-1.5 bg-white border border-grey-300 rounded-md text-xs font-semibold text-grey-700 hover:bg-grey-50 no-underline"
            >
              닫기
            </Link>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-grey-700 hover:text-grey-900">
              ▼ 자세히 (JSON 결과)
            </summary>
            <pre className="text-xs leading-[1.5] whitespace-pre-wrap break-words mt-2 p-3 bg-white rounded border border-grey-200 max-h-[400px] overflow-auto">
              {JSON.stringify(resultObj, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* 058 reset 결과 — 동일 강조 패턴 + 닫기 */}
      {resetTotal !== null && (
        <div
          role="status"
          className="rounded-xl p-5 mb-6 border-2 border-green bg-green/10 text-grey-900 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-lg font-extrabold mb-1">
                ✅ 영구 skip 해제 완료 — 총 {resetTotal.toLocaleString()}건
              </div>
              <div className="text-sm text-grey-700">
                welfare {resetWelfare.toLocaleString()}건 · loan {resetLoan.toLocaleString()}건 · 다음 cron (5분 이내) 부터 재시도 시작
              </div>
              <div className="text-xs text-grey-600 mt-1">
                {new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </div>
            </div>
            <Link
              href="/admin/enrich-detail"
              className="shrink-0 px-3 py-1.5 bg-white border border-grey-300 rounded-md text-xs font-semibold text-grey-700 hover:bg-grey-50 no-underline"
            >
              닫기
            </Link>
          </div>
        </div>
      )}

      {/* 트리거 폼 — target="_blank": 40초 소요라 새 탭 진행이 자연스러움 (cron-trigger 와 일관) */}
      <form action={triggerEnrich} target="_blank">
        <button
          type="submit"
          className="w-full py-3 bg-blue-500 text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors cursor-pointer"
        >
          지금 10건 보강 실행 ↗
        </button>
      </form>
      <p className="mt-3 text-sm text-grey-600 leading-[1.65]">
        * 한 번에 10건 × 4초 간격 = 약 40초 소요 (Vercel 60초 한도 안전).
        <br />
        * 성공 row 는 7일 cooldown, 실패 row 는 7일 cooldown + 3회 도달 시 영구 skip.
      </p>

      {/* 058 영구 skip 일괄 해제 — 외부 API 회복 시 재시도 진입점 */}
      {stats.skipped > 0 && (
        <div className="mt-8 pt-6 border-t border-grey-200">
          <h2 className="text-base font-bold text-grey-900 mb-2">
            영구 skip 해제 ({stats.skipped.toLocaleString()}건)
          </h2>
          <p className="text-sm text-grey-700 leading-[1.65] mb-3">
            외부 Detail API (예: bokjiro) 가 회복됐다는 확신이 들 때 누르세요.
            detail_failed_count·last_detail_failed_at 까지 함께 reset 되어 다음 cron 부터
            즉시 재시도합니다. 회복 안 됐다면 같은 row 가 3번 더 실패해서 다시 영구 skip 됩니다.
          </p>
          <form action={resetPermanentSkips} target="_blank">
            <button
              type="submit"
              className="w-full py-3 bg-red text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              {stats.skipped.toLocaleString()}건 영구 skip 전부 해제 ↗
            </button>
          </form>
        </div>
      )}

      <p className="mt-8 text-sm flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-blue-500 font-medium underline">← 어드민 홈</Link>
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-4">
      <div className="text-xs font-semibold tracking-[0.08em] text-grey-700 uppercase mb-1">{label}</div>
      <div className={`text-xl font-extrabold ${danger ? "text-red" : "text-grey-900"}`}>
        {value}
      </div>
      {hint && <div className="text-xs text-grey-600 mt-0.5">{hint}</div>}
    </div>
  );
}
