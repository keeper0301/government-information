// ============================================================
// /admin/cron-trigger — 모든 cron 수동 trigger 한 페이지 (Phase 5 #10)
// ============================================================
// 운영 부담 ↓: 각 admin 페이지에 분산되어있던 manual trigger 를 한 곳에서.
// CRON_SECRET 으로 self-POST. admin_actions 에 manual_cron_trigger 감사 로그.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";

export const metadata: Metadata = {
  title: "Cron 수동 실행 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/cron-trigger");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// vercel.json 의 cron 목록과 일치 — 새 cron 추가 시 여기도 갱신.
const CRON_LIST: { path: string; label: string; schedule: string; desc: string }[] = [
  { path: "/api/collect-news", label: "뉴스 수집 (korea.kr)", schedule: "매일 02시 UTC", desc: "korea.kr RSS 3개" },
  { path: "/api/enrich", label: "공고 detail 보강", schedule: "매 5분", desc: "bokjiro·youthcenter·mss" },
  { path: "/api/enrich-thumbnails", label: "naver-news og:image", schedule: "매 5분", desc: "BATCH 50" },
  { path: "/api/enrich-targeting", label: "본문 targeting 분석", schedule: "매일 08시 UTC", desc: "Phase 1.5 income/household 백필" },
  { path: "/api/cleanup-expired-programs", label: "만료 정책 정리", schedule: "매일 18시 UTC", desc: "apply_end < today 비활성화" },
  { path: "/api/alert-dispatch", label: "알림 발송", schedule: "매일 07시 UTC", desc: "이메일·카카오톡 (KST 16시)" },
  { path: "/api/finalize-deletions", label: "30일 유예 탈퇴 최종", schedule: "매일 06시 UTC", desc: "pending_deletions 만료분" },
  { path: "/api/indexnow-submit-recent", label: "IndexNow 제출", schedule: "매일 07:30 UTC", desc: "Bing/Yandex SEO" },
];

// 광역별 collect-news 17 (vercel.json 14:00~15:20 KST 5분 간격)
const PROVINCE_CRONS = [
  "seoul", "busan", "daegu", "incheon", "gwangju", "daejeon", "ulsan",
  "sejong", "gyeonggi", "gangwon", "chungbuk", "chungnam", "jeonbuk",
  "jeonnam", "gyeongbuk", "gyeongnam", "jeju",
];

async function triggerCron(formData: FormData): Promise<void> {
  "use server";
  const user = await requireAdmin();
  const path = String(formData.get("path") ?? "");
  // path validation 강화 — /api/[a-z0-9-/]+ 만 허용 (query·fragment·.. 차단).
  // SSRF·path traversal 방어 (admin 권한 갖고 있어도 안전 마진).
  if (!/^\/api\/[a-z0-9\-/]+$/i.test(path)) {
    redirect("/admin/cron-trigger?error=" + encodeURIComponent("잘못된 path"));
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    redirect("/admin/cron-trigger?error=" + encodeURIComponent("CRON_SECRET 누락"));
  }

  let result: Record<string, unknown> = {};
  let ok = false;
  try {
    const res = await fetch(`${siteUrl}${path}`, {
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
      action: "manual_cron_trigger",
      details: { path, ok, result },
    });
  } catch {
    // 감사 로그 실패해도 결과 노출
  }

  const qs = `path=${encodeURIComponent(path)}&ok=${ok ? "1" : "0"}&result=${encodeURIComponent(JSON.stringify(result))}`;
  redirect(`/admin/cron-trigger?${qs}`);
}

export default async function CronTriggerPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; ok?: string; result?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  let resultObj: Record<string, unknown> | null = null;
  if (params.result) {
    try {
      resultObj = JSON.parse(decodeURIComponent(params.result));
    } catch {
      resultObj = { raw: params.result };
    }
  }

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[860px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            Cron 수동 실행
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            평소엔 vercel cron 자동. 즉시 반영 필요 시 여기서 수동 trigger.
            모든 실행은 admin_actions.manual_cron_trigger 에 감사 기록.
          </p>
        </div>

        {/* 에러·결과 */}
        {params.error && (
          <div role="alert" className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red mb-4">
            {params.error}
          </div>
        )}
        {resultObj && (
          <div
            role="status"
            className={`rounded-lg p-4 mb-6 border ${
              params.ok === "1"
                ? "bg-blue-50 border-blue-100 text-grey-900"
                : "bg-red/10 border-red/30 text-red"
            }`}
          >
            <div className="text-[14px] font-bold mb-1">
              {params.ok === "1" ? "✅" : "❌"} {params.path}
            </div>
            <pre className="text-[12px] leading-[1.5] whitespace-pre-wrap break-words">
              {JSON.stringify(resultObj, null, 2)}
            </pre>
          </div>
        )}

        {/* 일반 cron 8종 */}
        <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          일반 Cron
        </h2>
        <div className="grid grid-cols-1 gap-2 mb-8">
          {CRON_LIST.map((c) => (
            <CronRow key={c.path} cron={c} />
          ))}
        </div>

        {/* 광역 collect-news 17 */}
        <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          광역 뉴스 수집 (17 시·도)
        </h2>
        <p className="text-[13px] text-grey-600 mb-3">
          매일 14:00~15:20 KST 5분 간격 자동 수집. 즉시 반영 필요 시 클릭.
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-8">
          {PROVINCE_CRONS.map((code) => (
            <form
              key={code}
              action={triggerCron}
              className="flex"
            >
              <input type="hidden" name="path" value={`/api/collect-news/${code}`} />
              <button
                type="submit"
                className="w-full px-2 py-2 bg-white border border-grey-200 rounded-lg text-[12px] font-semibold text-grey-900 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
              >
                {code}
              </button>
            </form>
          ))}
        </div>

        <p className="mt-10 text-[13px]">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
        </p>
      </div>
    </main>
  );
}

function CronRow({
  cron,
}: {
  cron: { path: string; label: string; schedule: string; desc: string };
}) {
  return (
    <form action={triggerCron} className="flex items-center gap-3 bg-white border border-grey-200 rounded-lg p-3">
      <input type="hidden" name="path" value={cron.path} />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-grey-900">{cron.label}</div>
        <div className="text-[12px] text-grey-600 leading-[1.5]">
          <code className="text-grey-700">{cron.path}</code>
          <span className="text-grey-400 mx-1.5">·</span>
          {cron.schedule}
          <span className="text-grey-400 mx-1.5">·</span>
          {cron.desc}
        </div>
      </div>
      <button
        type="submit"
        className="shrink-0 px-3 py-2 bg-blue-500 text-white text-[12px] font-semibold rounded-md hover:bg-blue-600 transition-colors cursor-pointer"
      >
        실행
      </button>
    </form>
  );
}
