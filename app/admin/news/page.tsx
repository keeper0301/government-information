// ============================================================
// /admin/news — 정책 뉴스 수집 운영 대시보드
// ============================================================
// 매일 cron (KST 11:00) 이 자동 수집하지만 즉시 수집·상태 점검 필요 시 사용.
//
// 동작:
//   - 상단 카드 4개: 전체 뉴스 / 정책뉴스 / 보도자료 / 정책자료 (각 누적 수)
//   - 최근 24h 수집 카운트 + 마지막 pub_date
//   - [지금 수집 실행] 버튼 → /api/collect-news self-POST
//   - admin_actions 에 collect_news_manual 감사 로그
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";

export const metadata: Metadata = {
  title: "정책 뉴스 운영 | 어드민",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/news");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

async function getStats() {
  const admin = createAdminClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [total, news, press, doc, last24h, latest] = await Promise.all([
    admin.from("news_posts").select("id", { count: "exact", head: true }),
    admin.from("news_posts").select("id", { count: "exact", head: true }).eq("category", "news"),
    admin.from("news_posts").select("id", { count: "exact", head: true }).eq("category", "press"),
    admin.from("news_posts").select("id", { count: "exact", head: true }).eq("category", "policy-doc"),
    admin.from("news_posts").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
    admin
      .from("news_posts")
      .select("published_at, title")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    total: total.count ?? 0,
    news: news.count ?? 0,
    press: press.count ?? 0,
    doc: doc.count ?? 0,
    last24h: last24h.count ?? 0,
    latestPublishedAt: latest.data?.published_at ?? null,
    latestTitle: latest.data?.title ?? null,
  };
}

// 수동 수집 트리거 — self-POST 로 /api/collect-news 호출
async function triggerCollect(): Promise<void> {
  "use server";
  const user = await requireAdmin();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    redirect("/admin/news?error=" + encodeURIComponent("CRON_SECRET 환경변수 누락"));
  }

  let result: Record<string, unknown> = {};
  let ok = false;
  try {
    const res = await fetch(`${siteUrl}/api/collect-news`, {
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
      action: "collect_news_manual",
      details: { ok, ...result },
    });
  } catch {
    // 감사 로그 실패해도 결과 노출
  }

  const qs = `ok=${ok ? "1" : "0"}&result=${encodeURIComponent(JSON.stringify(result))}`;
  redirect(`/admin/news?${qs}`);
}

export default async function AdminNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; result?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const stats = await getStats();

  let resultObj: Record<string, unknown> | null = null;
  if (params.result) {
    try {
      resultObj = JSON.parse(decodeURIComponent(params.result));
    } catch {
      resultObj = { raw: params.result };
    }
  }
  const resultOk = params.ok === "1";

  const latestLabel = stats.latestPublishedAt
    ? new Date(stats.latestPublishedAt).toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[720px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-burgundy font-semibold tracking-[0.2em] mb-3">ADMIN</p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            정책 뉴스 운영
          </h1>
          <p className="text-[14px] text-grey-600 leading-[1.6]">
            매일 KST 11:00 cron 이 korea.kr RSS 3개 피드를 자동 수집해요.
            수집 문제를 확인하거나 즉시 반영이 필요할 때 수동 실행할 수 있어요.
          </p>
        </div>

        {/* 상태 카드 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="전체" value={stats.total.toLocaleString()} />
          <StatCard label="정책뉴스" value={stats.news.toLocaleString()} />
          <StatCard label="보도자료" value={stats.press.toLocaleString()} />
          <StatCard label="정책자료" value={stats.doc.toLocaleString()} />
        </div>

        {/* 최근 24h · 마지막 발행 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <StatCard label="최근 24h 수집" value={`+${stats.last24h.toLocaleString()}건`} />
          <div className="bg-white rounded-lg border border-grey-200 p-4">
            <div className="text-[11px] font-semibold tracking-[0.1em] text-grey-600 uppercase mb-1">
              최신 발행
            </div>
            <div className="text-[13px] font-semibold text-grey-900 truncate">
              {stats.latestTitle ?? "—"}
            </div>
            <div className="text-[11px] text-grey-600 mt-0.5">{latestLabel}</div>
          </div>
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
              {resultOk ? "✅ 수집 완료" : "❌ 수집 실패"}
            </div>
            <pre className="text-[12px] leading-[1.5] whitespace-pre-wrap break-words">
              {JSON.stringify(resultObj, null, 2)}
            </pre>
          </div>
        )}

        {/* 트리거 폼 */}
        <form action={triggerCollect}>
          <button
            type="submit"
            className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
          >
            지금 수집 실행
          </button>
        </form>
        <p className="mt-3 text-[12px] text-grey-600 leading-[1.6]">
          * 3개 RSS 피드 합쳐 한 번 실행에 5~10초 소요. 중복은 source_id 기준 자동 병합돼요.
          <br />
          * 수집된 뉴스는 /news 에서 바로 확인할 수 있어요.
        </p>

        <p className="mt-8 text-[12px] flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="text-blue-500 underline">← 어드민 홈</Link>
          <span className="text-grey-300">·</span>
          <Link href="/news" className="text-blue-500 underline">정책 소식 페이지 보기 ↗</Link>
        </p>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-4">
      <div className="text-[11px] font-semibold tracking-[0.1em] text-grey-600 uppercase mb-1">
        {label}
      </div>
      <div className="text-[20px] font-extrabold text-grey-900">{value}</div>
      {hint && <div className="text-[11px] text-grey-600 mt-0.5">{hint}</div>}
    </div>
  );
}
