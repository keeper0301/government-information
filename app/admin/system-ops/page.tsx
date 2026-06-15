import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { getCronAuthorizationHeader } from "@/lib/cron-auth";
import { getKeepioAgentStatus } from "@/lib/analytics/keepio-agent-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "시스템 운영 콘솔 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SystemActionMethod = "GET" | "POST";
type SystemActionGroup = "status" | "social" | "content" | "repair" | "search";

type SystemAction = {
  path: string;
  label: string;
  group: SystemActionGroup;
  method: SystemActionMethod;
  desc: string;
  primary?: boolean;
};

const SYSTEM_ACTIONS: SystemAction[] = [
  {
    path: "/api/cron/agent-resident-cycle",
    label: "상주 agent cycle 실행",
    group: "status",
    method: "POST",
    desc: "AI 상주 관리자, 버그/업그레이드 관리, 사이트 점검을 한 번 돌립니다.",
    primary: true,
  },
  {
    path: "/api/cron/health-alert",
    label: "감시 알림 점검",
    group: "status",
    method: "POST",
    desc: "사이트/cron/백로그 이상 신호를 확인하고 필요한 알림을 보냅니다.",
    primary: true,
  },
  {
    path: "/api/cron/instagram-comment-drafts",
    label: "인스타 댓글 답글 초안",
    group: "social",
    method: "POST",
    desc: "공개 게시 없이 댓글 답글 초안만 생성합니다.",
    primary: true,
  },
  {
    path: "/api/cron/instagram-publish",
    label: "인스타 발행 gate 확인",
    group: "social",
    method: "POST",
    desc: "승인/safety gate 조건을 통과한 후보만 처리합니다.",
  },
  {
    path: "/api/cron/blog-quality-check",
    label: "블로그 발행 관리",
    group: "content",
    method: "POST",
    desc: "짧은 글, 품질 이슈, 발행 상태를 점검합니다.",
    primary: true,
  },
  {
    path: "/api/cron/autonomous-improvement-scan",
    label: "개선 과제 스캔",
    group: "repair",
    method: "POST",
    desc: "운영 신호를 읽고 오늘 처리할 개선/버그 과제를 갱신합니다.",
    primary: true,
  },
  {
    path: "/api/cron/failed-cron-retry",
    label: "실패 cron 재시도",
    group: "repair",
    method: "POST",
    desc: "최근 실패한 cron을 안전하게 1회 재시도합니다.",
  },
  {
    path: "/api/cron/silent-fail-detect",
    label: "무음 실패 감지",
    group: "repair",
    method: "POST",
    desc: "실패 로그 없이 멈춘 작업을 찾아 알림/감사 로그로 남깁니다.",
  },
  {
    path: "/api/cron/policy-url-check",
    label: "정책 URL 오류 점검",
    group: "search",
    method: "GET",
    desc: "깨진 신청/출처 링크를 확인하고 알림을 남깁니다.",
  },
  {
    path: "/api/indexnow-submit-recent",
    label: "IndexNow 제출",
    group: "search",
    method: "POST",
    desc: "최근 갱신된 페이지를 검색 엔진에 제출합니다.",
  },
  {
    path: "/api/cron/policy-ai-guide-backfill",
    label: "정책 AI 가이드 보강",
    group: "search",
    method: "POST",
    desc: "정책 상세 페이지의 이용 팁/FAQ성 보강 콘텐츠를 채웁니다.",
  },
  {
    path: "/api/cron/news-ai-commentary-backfill",
    label: "뉴스 AI 해설 보강",
    group: "search",
    method: "POST",
    desc: "뉴스 상세 페이지의 시민 관점 해설을 보강합니다.",
  },
];

const ACTION_BY_PATH = new Map(SYSTEM_ACTIONS.map((item) => [item.path, item]));

const GROUP_LABELS: Record<SystemActionGroup, string> = {
  status: "상태/감시",
  social: "SNS/댓글",
  content: "발행 관리",
  repair: "수정/오류 해결",
  search: "검색/콘텐츠 업그레이드",
};

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
  "KEEPIO_AGENT_HEALTH_URL",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "AI_MANAGER_ENABLED",
  "BLOG_MANAGER_ENABLED",
  "SITE_MAINTENANCE_MANAGER_ENABLED",
  "SITE_UPGRADE_MANAGER_ENABLED",
  "INSTAGRAM_ACCESS_TOKEN",
  "GMAIL_CLIENT_ID",
  "GMAIL_REFRESH_TOKEN",
];

type RecentRun = {
  id: string;
  path: string;
  method: string;
  ok: boolean;
  status: number | null;
  createdAt: string;
};

async function requireAdmin(next = "/admin/system-ops") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

function summarizeResult(result: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of [
    "ok",
    "ready",
    "checked",
    "dead",
    "ok_count",
    "collected",
    "inserted",
    "updated",
    "created",
    "alerts",
    "retried",
    "failed",
    "message",
    "error",
  ]) {
    const value = result[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.length > 0 ? parts.slice(0, 8).join(", ") : "실행 결과는 감사 로그에 저장됐습니다.";
}

async function getRecentRuns(limit = 8): Promise<RecentRun[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_actions")
    .select("id, details, created_at")
    .eq("action", "manual_cron_trigger")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => {
    const details = (row.details ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id),
      path: typeof details.path === "string" ? details.path : "-",
      method: typeof details.method === "string" ? details.method : "POST",
      ok: details.ok === true,
      status: typeof details.status === "number" ? details.status : null,
      createdAt: row.created_at,
    };
  });
}

async function runSystemAction(formData: FormData): Promise<void> {
  "use server";
  const user = await requireAdmin();
  const path = String(formData.get("path") ?? "");
  const action = ACTION_BY_PATH.get(path);

  if (!action) {
    redirect("/admin/system-ops?ok=0&message=" + encodeURIComponent("허용되지 않은 실행 대상입니다."));
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const authorizationHeader = getCronAuthorizationHeader();
  if (!authorizationHeader) {
    redirect("/admin/system-ops?ok=0&message=" + encodeURIComponent("CRON_SECRET 설정이 필요합니다."));
  }

  let ok = false;
  let status = 0;
  let result: Record<string, unknown> = {};
  try {
    const res = await fetch(`${siteUrl}${action.path}`, {
      method: action.method,
      headers: { Authorization: authorizationHeader },
      cache: "no-store",
    });
    status = res.status;
    const contentType = res.headers.get("content-type") ?? "";
    result = contentType.includes("application/json")
      ? ((await res.json()) as Record<string, unknown>)
      : { text: (await res.text()).slice(0, 500) };
    ok = res.ok;
  } catch (err) {
    result = { error: err instanceof Error ? err.message : "알 수 없는 오류" };
  }

  try {
    await logAdminAction({
      actorId: user.id,
      action: "manual_cron_trigger",
      details: {
        path: action.path,
        method: action.method,
        label: action.label,
        ok,
        status,
        result,
        source: "system_ops_console",
      },
    });
  } catch {
    // 실행 결과를 우선 보여주고 감사 로그 실패는 페이지를 막지 않습니다.
  }

  const params = new URLSearchParams({
    ok: ok ? "1" : "0",
    path: action.path,
    status: String(status),
    message: summarizeResult(result),
  });
  redirect(`/admin/system-ops?${params.toString()}`);
}

function formatKst(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {label}: {ok ? "정상" : "확인 필요"}
    </span>
  );
}

export default async function SystemOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; path?: string; status?: string; message?: string }>;
}) {
  await requireAdmin();
  const [params, agentStatus, recentRuns] = await Promise.all([
    searchParams,
    getKeepioAgentStatus(),
    getRecentRuns(),
  ]);

  const groupedActions = SYSTEM_ACTIONS.reduce<Record<SystemActionGroup, SystemAction[]>>(
    (acc, item) => {
      acc[item.group].push(item);
      return acc;
    },
    { status: [], social: [], content: [], repair: [], search: [] },
  );

  const configRows = ENV_KEYS.map((key) => ({
    key,
    configured: Boolean(process.env[key]),
  }));

  return (
    <div className="max-w-[1080px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="시스템 운영 콘솔"
        description="상태 확인, 기능 실행, 오류 재시도, 콘텐츠 보강을 한 화면에서 처리합니다. 민감한 환경변수 값은 표시하지 않습니다."
      />

      {params.message && (
        <div
          role="status"
          className={`mb-5 rounded-lg border p-4 text-sm ${
            params.ok === "1"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <div className="font-bold">
            {params.ok === "1" ? "실행 완료" : "실행 실패"}
            {params.status ? ` · HTTP ${params.status}` : ""}
          </div>
          <div className="mt-1 font-mono text-xs">{params.path}</div>
          <div className="mt-2">{params.message}</div>
        </div>
      )}

      <section className="mb-6 rounded-xl border border-grey-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-bold text-grey-900">자동화 준비 상태</h2>
            <p className="mt-1 text-sm text-grey-600">
              {agentStatus.sourceLabel} · 확인 {formatKst(agentStatus.checkedAt)}
            </p>
          </div>
          <div className="text-left md:text-right">
            <div className="text-2xl font-extrabold text-grey-900">
              {agentStatus.readinessSummary.ready}/{agentStatus.readinessSummary.total}
            </div>
            <div className="text-xs font-semibold text-grey-600">
              준비율 {agentStatus.readinessSummary.readinessPercent}%
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-grey-100">
          <div
            className={`h-full ${
              agentStatus.readinessSummary.healthTone === "green"
                ? "bg-green-500"
                : agentStatus.readinessSummary.healthTone === "amber"
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${agentStatus.readinessSummary.readinessPercent}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge ok={agentStatus.ready} label="agent" />
          <StatusBadge ok={agentStatus.aiManagerEnabled && agentStatus.aiManagerConfigured} label="AI 상주 관리자" />
          <StatusBadge ok={agentStatus.blogManagerEnabled} label="블로그 발행 관리" />
          <StatusBadge ok={agentStatus.siteMaintenanceEnabled} label="사이트 점검" />
          <StatusBadge ok={agentStatus.siteUpgradeEnabled} label="업그레이드/버그 관리" />
          <StatusBadge ok={agentStatus.automation.instagramComments} label="인스타 댓글 답글" />
        </div>

        {agentStatus.actionItems.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-bold text-amber-900">다음 확인</div>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {agentStatus.actionItems.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-bold text-grey-900">빠른 실행</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {(Object.keys(groupedActions) as SystemActionGroup[]).map((group) => (
            <div key={group} className="rounded-xl border border-grey-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-grey-900">{GROUP_LABELS[group]}</h3>
              <div className="space-y-3">
                {groupedActions[group].map((item) => (
                  <div
                    key={item.path}
                    className={`rounded-lg border p-3 ${
                      item.primary ? "border-blue-200 bg-blue-50/40" : "border-grey-100 bg-grey-50"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-bold text-grey-900">{item.label}</div>
                        <div className="mt-1 text-xs leading-relaxed text-grey-600">{item.desc}</div>
                        <div className="mt-2 font-mono text-[11px] text-grey-500">
                          {item.method} {item.path}
                        </div>
                      </div>
                      <form action={runSystemAction}>
                        <input type="hidden" name="path" value={item.path} />
                        <button
                          type="submit"
                          className="w-full rounded-md bg-grey-900 px-3 py-2 text-xs font-bold text-white hover:bg-grey-800 sm:w-auto"
                        >
                          실행
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-grey-200 bg-white p-4">
          <h2 className="text-base font-bold text-grey-900">오류 해결 바로가기</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["/admin/cron-failures", "cron 실패 재시도"],
              ["/admin/health", "헬스 대시보드"],
              ["/admin/autonomous", "자율 운영 마스터"],
              ["/admin/instagram-comments", "댓글 답글 검수"],
              ["/admin/external-actions", "외부 액션 가이드"],
              ["/admin/my-actions", "감사 로그"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-grey-200 px-3 py-2 text-sm font-semibold text-grey-800 no-underline hover:bg-grey-50"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-grey-200 bg-white p-4">
          <h2 className="text-base font-bold text-grey-900">시스템 구성</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {configRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg bg-grey-50 px-3 py-2">
                <span className="font-mono text-xs text-grey-700">{row.key}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    row.configured ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {row.configured ? "설정됨" : "미설정"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-grey-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-grey-900">최근 실행</h2>
          <Link href="/admin/cron-trigger" className="text-sm font-semibold text-blue-600 no-underline">
            전체 cron 실행
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-grey-200 text-xs text-grey-500">
              <tr>
                <th className="py-2 pr-3">시간</th>
                <th className="py-2 pr-3">대상</th>
                <th className="py-2 pr-3">방식</th>
                <th className="py-2 pr-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 ? (
                <tr>
                  <td className="py-4 text-grey-500" colSpan={4}>
                    최근 실행 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                recentRuns.map((run) => (
                  <tr key={run.id} className="border-b border-grey-100 last:border-b-0">
                    <td className="py-2 pr-3 text-xs text-grey-600">{formatKst(run.createdAt)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-grey-800">{run.path}</td>
                    <td className="py-2 pr-3 text-xs text-grey-600">{run.method}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          run.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {run.ok ? "성공" : "실패"}
                        {run.status ? ` ${run.status}` : ""}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
