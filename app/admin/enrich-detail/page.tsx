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
async function getStats() {
  const admin = createAdminClient();
  const bokjiroCond = "source_code.eq.bokjiro,source_code.eq.local-welfare";

  const [total, fetched, failed] = await Promise.all([
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
  ]);

  const total_n = total.count ?? 0;
  const fetched_n = fetched.count ?? 0;
  const failed_n = failed.count ?? 0;
  const pending_n = Math.max(0, total_n - fetched_n - failed_n);
  return { total: total_n, fetched: fetched_n, pending: pending_n, failed: failed_n };
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

export default async function EnrichDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; result?: string; error?: string }>;
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

  const pct =
    stats.total > 0 ? Math.round((stats.fetched / stats.total) * 1000) / 10 : 0;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[720px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">ADMIN</p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            공고 상세 수동 보강
          </h1>
          <p className="text-[14px] text-grey-600 leading-[1.6]">
            cron (매일 6회, 하루 60건) 이 자동 처리하지만, 지금 즉시 10건 추가
            처리가 필요할 때 쓰세요. data.go.kr 개발계정 일일 할당량 100회 중
            cron 이 60회 사용하니 수동 trigger 는 하루 3~4회 정도 여유 있습니다.
          </p>
        </div>

        {/* 상태 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="전체" value={stats.total.toLocaleString()} />
          <StatCard label="채워짐" value={stats.fetched.toLocaleString()} hint={`${pct}%`} />
          <StatCard label="남음" value={stats.pending.toLocaleString()} />
          <StatCard label="실패" value={stats.failed.toLocaleString()} danger />
        </div>

        {/* 에러 메시지 */}
        {params.error && (
          <div role="alert" className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-4">
            {params.error}
          </div>
        )}

        {/* 결과 배너 */}
        {resultObj && (
          <div
            role="status"
            className={`rounded-lg p-4 mb-4 border ${
              resultOk
                ? "bg-blue-50 border-blue-100 text-grey-900"
                : "bg-red/10 border-red/30 text-red"
            }`}
          >
            <div className="text-[14px] font-bold mb-1">
              {resultOk ? "✅ 보강 실행 완료" : "❌ 보강 실행 실패"}
            </div>
            <pre className="text-[12px] leading-[1.5] whitespace-pre-wrap break-words">
              {JSON.stringify(resultObj, null, 2)}
            </pre>
          </div>
        )}

        {/* 트리거 폼 */}
        <form action={triggerEnrich}>
          <button
            type="submit"
            className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
          >
            지금 10건 보강 실행
          </button>
        </form>
        <p className="mt-3 text-[12px] text-grey-600 leading-[1.6]">
          * 한 번에 10건 × 4초 간격 = 약 40초 소요 (Vercel 60초 한도 안전).
          <br />
          * 성공 row 는 7일 cooldown, 실패 row 는 1일 cooldown 후 자동 재처리.
        </p>

        <p className="mt-8 text-[12px] flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="text-blue-500 underline">← 어드민 홈</Link>
        </p>
      </div>
    </main>
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
      <div className="text-[11px] font-semibold tracking-[0.1em] text-grey-600 uppercase mb-1">{label}</div>
      <div className={`text-[20px] font-extrabold ${danger ? "text-red" : "text-grey-900"}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-grey-600 mt-0.5">{hint}</div>}
    </div>
  );
}
