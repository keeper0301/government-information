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
import { createAdminClient } from "@/lib/supabase/admin";
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
  { path: "/api/cron/press-ingest", label: "광역 보도자료 자동 ingest", schedule: "매일 16:30 UTC", desc: "Anthropic Haiku · welfare/loan 자동 등록" },
];

// 최근 실행 fetch — 사장님이 "방금 누른 게 됐나?" 한눈에 확인.
type RecentRun = {
  id: string;
  path: string;
  ok: boolean;
  createdAt: string;
};

async function getRecentRuns(limit = 5): Promise<RecentRun[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_actions")
    .select("id, details, created_at")
    .eq("action", "manual_cron_trigger")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => {
    const details = (r.details ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      path: typeof details.path === "string" ? details.path : "—",
      ok: details.ok === true,
      createdAt: r.created_at,
    };
  });
}

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

  const recentRuns = await getRecentRuns(5);

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
            <br />
            <strong className="text-grey-900">[실행 ↗] 클릭 시 새 탭에서 진행</strong> — 원래 탭 유지하며 여러 cron 동시 실행 가능. LLM 분류 cron 은 60~90초 소요.
            <br />
            모든 실행은 admin_actions.manual_cron_trigger 에 감사 기록 + 아래 "최근 실행 5건" 섹션에 자동 갱신.
          </p>
        </div>

        {/* 에러 — 빨강 강조 */}
        {params.error && (
          <div role="alert" className="bg-red/10 border-2 border-red rounded-lg p-4 text-[14px] text-red mb-4">
            ❌ {params.error}
          </div>
        )}

        {/* 실행 결과 — 강한 시각·timestamp·자세히 토글·닫기 버튼.
            redirect 후 페이지 맨 위에 큰 배너로 노출 → 사장님이 못 알아챌 일 0. */}
        {resultObj && (
          <div
            role="status"
            className={`rounded-xl p-5 mb-6 border-2 shadow-sm ${
              params.ok === "1"
                ? "bg-green/10 border-green text-grey-900"
                : "bg-red/10 border-red text-red"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-[18px] font-extrabold mb-1">
                  {params.ok === "1" ? "✅ 실행 완료" : "❌ 실행 실패"}
                </div>
                <div className="text-[13px] font-mono text-grey-700">
                  {params.path}
                </div>
                <div className="text-[12px] text-grey-600 mt-1">
                  {new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </div>
              </div>
              <Link
                href="/admin/cron-trigger"
                className="shrink-0 px-3 py-1.5 bg-white border border-grey-300 rounded-md text-[12px] font-semibold text-grey-700 hover:bg-grey-50 no-underline"
              >
                닫기
              </Link>
            </div>
            {/* 자세히 — 기본 접힘. summary 가 한 줄 요약 표시. */}
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-grey-700 hover:text-grey-900">
                ▼ 자세히 (JSON 결과)
              </summary>
              <pre className="text-[12px] leading-[1.5] whitespace-pre-wrap break-words mt-2 p-3 bg-white rounded border border-grey-200 max-h-[400px] overflow-auto">
                {JSON.stringify(resultObj, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* 최근 실행 5건 — "방금 누른 게 됐나?" 한눈에 확인.
            결과 배너를 못 봐도 여기 새 row 가 떠 있으면 trigger 작동 확인 가능. */}
        {recentRuns.length > 0 && (
          <div className="bg-white border border-grey-200 rounded-lg p-4 mb-6">
            <div className="text-[13px] font-bold text-grey-900 mb-2">
              최근 실행 {recentRuns.length}건
            </div>
            <ul className="space-y-1.5">
              {recentRuns.map((r) => {
                const t = new Date(r.createdAt);
                const ago = Math.max(0, Math.floor((Date.now() - t.getTime()) / 1000));
                const agoLabel =
                  ago < 60
                    ? `${ago}초 전`
                    : ago < 3600
                    ? `${Math.floor(ago / 60)}분 전`
                    : `${Math.floor(ago / 3600)}시간 전`;
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 text-[12px] font-mono"
                  >
                    <span className={r.ok ? "text-green" : "text-red"}>
                      {r.ok ? "✅" : "❌"}
                    </span>
                    <span className="flex-1 truncate text-grey-800">{r.path}</span>
                    <span className="shrink-0 text-grey-500">{agoLabel}</span>
                  </li>
                );
              })}
            </ul>
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
              target="_blank"
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
  // target="_blank" — 새 탭에서 cron 실행 + 결과 표시.
  // 원래 탭은 그대로 유지되어 여러 cron 동시 실행 + 진행 상황 비교 가능.
  // LLM 호출 등 60~90초 걸리는 cron 도 사장님이 다른 작업 자유롭게 가능.
  return (
    <form action={triggerCron} target="_blank" className="flex items-center gap-3 bg-white border border-grey-200 rounded-lg p-3">
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
        실행 ↗
      </button>
    </form>
  );
}
