// ============================================================
// /admin/alimtalk — 카카오 알림톡 운영 대시보드
// ============================================================
// 두 섹션:
//   1) 발송 현황 — 최근 24h alert_deliveries 집계 (channel='kakao')
//      · sent / failed / skipped 별 건수
//      · skipped 사유별 breakdown (consent_missing, kakao_provider_not_configured)
//      · failed 에러 Top 5 (blocked_by_user/template_rejected 등)
//   2) 테스트 발송 폼 — 본인 번호 입력 → POLICY_NEW 발송 → 결과 즉시 표시
//
// 권한: ADMIN_EMAILS 환경변수에 포함된 이메일 만 접근. 그 외 / 로 redirect.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AlimtalkTestForm } from "./test-form";
import { AlimtalkPreviewCard } from "./preview-card";

export const metadata: Metadata = {
  title: "알림톡 운영 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type DeliveryRow = {
  status: "queued" | "sent" | "failed" | "skipped";
  error: string | null;
};

// 최근 발송 로그 — 개별 건 추적 (집계만으론 "누구에게 언제 왜 실패" 못 봄).
// channel='kakao' 최근 N건. user_id 는 /admin/users/[id] 로 연결해 즉시 상세.
type DeliveryLogRow = {
  id: string;
  created_at: string;
  sent_at: string | null;
  user_id: string;
  program_title: string | null;
  status: "queued" | "sent" | "failed" | "skipped";
  error: string | null;
};

async function getRecentDeliveries(limit = 20): Promise<DeliveryLogRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("alert_deliveries")
    .select("id, created_at, sent_at, user_id, program_title, status, error")
    .eq("channel", "kakao")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as DeliveryLogRow[];
}

// 최근 7일 일자별 sent/failed/skipped 집계 → sparkline 추세 시각화용.
// 운영 초기엔 일 수십~수백 건 수준이라 인덱스 풀스캔 OK. 앱 메모리 그룹핑.
type DailyBucket = {
  date: string;       // YYYY-MM-DD (KST)
  label: string;      // "4/26" 등 짧은 표기
  sent: number;
  failed: number;
  skipped: number;
};

async function get7dDailyStats(): Promise<DailyBucket[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("alert_deliveries")
    .select("status, created_at")
    .eq("channel", "kakao")
    .gte("created_at", since);

  // 7일치 빈 버킷 생성 (오늘 KST 기준 거꾸로 6일 전까지)
  const buckets = new Map<string, DailyBucket>();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const kstStr = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
    const label = d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
    });
    buckets.set(kstStr, { date: kstStr, label, sent: 0, failed: 0, skipped: 0 });
  }

  for (const row of data ?? []) {
    const r = row as { status: string; created_at: string };
    const kstStr = new Date(r.created_at).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Seoul",
    });
    const bucket = buckets.get(kstStr);
    if (!bucket) continue; // 7일 윈도우 밖
    if (r.status === "sent") bucket.sent += 1;
    else if (r.status === "failed") bucket.failed += 1;
    else if (r.status === "skipped") bucket.skipped += 1;
  }

  return [...buckets.values()];
}

// 24h 집계 — 필요한 컬럼만 조회해 가볍게. 운영 초기엔 수백 건 수준이라 인덱스 풀스캔 OK.
async function collect24hStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  skippedBreakdown: { reason: string; count: number }[];
  failedBreakdown: { reason: string; count: number }[];
}> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("alert_deliveries")
    .select("status, error")
    .eq("channel", "kakao")
    .gte("created_at", since);

  if (error || !data) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedBreakdown: [],
      failedBreakdown: [],
    };
  }

  const rows = data as DeliveryRow[];
  const total = rows.length;
  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;

  // skipped 사유 분류 — error 컬럼 값 기반 (consent_missing / kakao_provider_not_configured)
  const skippedMap = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "skipped") continue;
    const reason = r.error ?? "unknown";
    skippedMap.set(reason, (skippedMap.get(reason) ?? 0) + 1);
  }

  // failed 원인 Top 5 — error 문자열에서 콜론 이전의 코드 부분만 추출해 그룹핑
  const failedMap = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "failed") continue;
    const errStr = r.error ?? "unknown";
    const code = errStr.split(":")[0].trim() || "unknown";
    failedMap.set(code, (failedMap.get(code) ?? 0) + 1);
  }

  return {
    total,
    sent,
    failed,
    skipped,
    skippedBreakdown: [...skippedMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    failedBreakdown: [...failedMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

// 사유 코드 → 한글 라벨 (UI 가독성)
const REASON_LABELS: Record<string, string> = {
  consent_missing: "수신 동의 없음",
  kakao_provider_not_configured: "발송 대행사 환경변수 미설정",
  BlockedNumber: "사용자 차단",
  UnavailableReceiver: "수신 불가",
  InvalidTemplate: "템플릿 불일치",
  TemplateNotApproved: "템플릿 미승인",
  TemplateNotFound: "템플릿 없음",
  unknown: "알 수 없음",
};

// Solapi 발송에 필요한 환경변수 목록. 각 항목의 존재 여부·길이만 UI 에 노출해
// 값 유출 없이 "등록 여부" 감지 가능. provider 만 값 자체 표시 (공개돼도 OK).
const REQUIRED_ENVS = [
  { name: "KAKAO_ALIMTALK_PROVIDER", exposeValue: true },
  { name: "SOLAPI_API_KEY", exposeValue: false },
  { name: "SOLAPI_API_SECRET", exposeValue: false },
  { name: "KAKAO_CHANNEL_PFID", exposeValue: false },
  { name: "SOLAPI_TEMPLATE_ID_POLICY_NEW", exposeValue: false },
] as const;

type EnvStatus = {
  name: string;
  present: boolean;
  displayValue: string | null;
};

function checkEnvStatus(): { envs: EnvStatus[]; allSet: boolean } {
  const envs: EnvStatus[] = REQUIRED_ENVS.map(({ name, exposeValue }) => {
    const raw = process.env[name];
    const present = typeof raw === "string" && raw.trim().length > 0;
    let displayValue: string | null = null;
    if (present && raw) {
      if (exposeValue) {
        displayValue = raw;
      } else {
        // 값 미노출 — 글자 수만 표시해 "오타 없이 복붙됐는지" 감만 확인 가능.
        displayValue = `${raw.length}자`;
      }
    }
    return { name, present, displayValue };
  });
  const allSet = envs.every((e) => e.present);
  return { envs, allSet };
}

export default async function AlimtalkAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/alimtalk");
  if (!isAdminUser(user.email)) redirect("/");

  const [stats, recentLogs, dailyStats] = await Promise.all([
    collect24hStats(),
    getRecentDeliveries(20),
    get7dDailyStats(),
  ]);

  // 7일 합산 실패율 (분모는 sent + failed, skipped 제외)
  const total7d = dailyStats.reduce((s, d) => s + d.sent + d.failed, 0);
  const failed7d = dailyStats.reduce((s, d) => s + d.failed, 0);
  const failRate7d = total7d > 0 ? (failed7d / total7d) * 100 : 0;
  const templateApprovedAt = process.env.KAKAO_TEMPLATE_APPROVED_AT?.trim() || null;
  const { envs: envStatus, allSet: envsAllSet } = checkEnvStatus();
  const setCount = envStatus.filter((e) => e.present).length;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[820px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN / ALIMTALK
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            카카오 알림톡 운영
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            최근 24시간 발송 현황과 테스트 발송 도구.
          </p>
        </div>

        {/* 환경변수 설정 체크리스트 */}
        <section className="mb-6 rounded-lg border border-grey-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-grey-900 tracking-[-0.3px]">
              환경변수 설정 상태
            </h2>
            <span
              className={`text-[12px] font-semibold px-2 py-0.5 rounded ${
                envsAllSet
                  ? "bg-blue-50 text-blue-700"
                  : "bg-yellow-50 text-yellow-800"
              }`}
            >
              {setCount} / {envStatus.length} 설정됨
            </span>
          </div>

          <ul className="space-y-1.5 text-[13px]">
            {envStatus.map((e) => (
              <li
                key={e.name}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-grey-100 last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">
                    {e.present ? "✅" : "❌"}
                  </span>
                  <code className="text-grey-800 break-all">{e.name}</code>
                </div>
                <span className={`shrink-0 text-[12px] ${e.present ? "text-grey-700" : "text-yellow-800"}`}>
                  {e.displayValue ?? "미설정"}
                </span>
              </li>
            ))}
          </ul>

          <div
            className={`mt-4 rounded-lg border p-3 text-[13px] leading-[1.65] ${
              envsAllSet
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-yellow-300 bg-yellow-50 text-yellow-900"
            }`}
          >
            {envsAllSet ? (
              <>
                ✅ 환경변수 5종 모두 설정되었습니다. 아래 <strong>테스트 발송</strong> 폼에서
                본인 번호로 POLICY_NEW 알림톡이 정상 수신되는지 확인해 주세요.
              </>
            ) : (
              <>
                ⚠️ 아직 설정되지 않은 환경변수가 있습니다.{" "}
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold"
                >
                  Vercel 대시보드
                </a>{" "}
                → keepioo 프로젝트 → <strong>Settings → Environment Variables</strong> 에서
                추가 후 재배포(Deployments → 최신 배포 우측 ⋯ → Redeploy) 가 필요합니다.
                값은 보안을 위해 화면에 노출되지 않고, 글자 수와 설정 여부만 표시됩니다.
              </>
            )}
          </div>
        </section>

        {/* 템플릿 승인일 안내 — KAKAO_TEMPLATE_APPROVED_AT 환경변수 등록 시 노출 */}
        {templateApprovedAt && (
          <section className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-[13px] text-blue-900">
              ✅ 카카오 알림톡 템플릿 <strong>POLICY_NEW</strong> 승인일:{" "}
              <strong>{templateApprovedAt}</strong>
              <span className="ml-2 text-[13px] text-blue-700">
                (Vercel 환경변수 KAKAO_TEMPLATE_APPROVED_AT 로 관리)
              </span>
            </p>
          </section>
        )}

        {/* 7일 실패율 추이 그래프 */}
        <section className="mb-8">
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">
            최근 7일 발송 추이
          </h2>
          <div className="rounded-lg border border-grey-200 bg-white p-4">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[13px] text-grey-700">
                일별 성공·실패 (skipped 제외)
              </p>
              <p
                className={`text-[13px] font-semibold ${
                  failRate7d >= 10
                    ? "text-red"
                    : failRate7d >= 5
                    ? "text-yellow-700"
                    : "text-blue-700"
                }`}
              >
                7일 실패율 {failRate7d.toFixed(1)}%
                <span className="ml-1 text-grey-500 font-normal">
                  ({failed7d}/{total7d})
                </span>
              </p>
            </div>
            <DailyBarChart buckets={dailyStats} />
          </div>
        </section>

        {/* 24h 집계 카드 */}
        <section className="mb-8">
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">
            최근 24시간 발송 현황
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="총 시도" value={stats.total} tone="neutral" />
            <StatCard label="발송 완료" value={stats.sent} tone="success" />
            <StatCard label="실패" value={stats.failed} tone="danger" />
            <StatCard label="건너뜀" value={stats.skipped} tone="muted" />
          </div>

          {stats.skippedBreakdown.length > 0 && (
            <div className="mt-4 rounded-lg border border-grey-200 bg-white p-4">
              <p className="text-[13px] font-semibold text-grey-800 mb-2">
                건너뜀 사유
              </p>
              <ul className="text-[13px] text-grey-700 space-y-1">
                {stats.skippedBreakdown.map((r) => (
                  <li key={r.reason} className="flex justify-between">
                    <span>{REASON_LABELS[r.reason] ?? r.reason}</span>
                    <span className="font-semibold">{r.count}건</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stats.failedBreakdown.length > 0 && (
            <div className="mt-3 rounded-lg border border-grey-200 bg-white p-4">
              <p className="text-[13px] font-semibold text-grey-800 mb-2">
                실패 원인 Top 5
              </p>
              <ul className="text-[13px] text-grey-700 space-y-1">
                {stats.failedBreakdown.map((r) => (
                  <li key={r.reason} className="flex justify-between">
                    <span>{REASON_LABELS[r.reason] ?? r.reason}</span>
                    <span className="font-semibold">{r.count}건</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stats.total === 0 && (
            <p className="mt-4 text-[13px] text-grey-600">
              최근 24시간 동안 카카오 알림톡 발송 시도가 없습니다.
            </p>
          )}
        </section>

        {/* 최근 발송 로그 — 집계 카드로는 "누구에게 언제 왜 실패" 추적 불가.
            최근 20건 개별 row 로 문의 대응 시 즉시 원인 파악 가능하게. */}
        <section className="mb-8">
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">
            최근 발송 로그 (최근 {recentLogs.length}건)
          </h2>
          {recentLogs.length === 0 ? (
            <div className="rounded-lg border border-grey-200 bg-white p-4 text-[13px] text-grey-600">
              최근 카카오 알림톡 발송 기록이 없어요.
            </div>
          ) : (
            <div className="rounded-lg border border-grey-200 bg-white overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-grey-600 border-b border-grey-200 bg-grey-50">
                    <th className="py-2 px-3 font-medium whitespace-nowrap">시각</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">사용자</th>
                    <th className="py-2 px-3 font-medium">정책</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">상태</th>
                    <th className="py-2 px-3 font-medium">오류·비고</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-grey-100 last:border-b-0 align-top"
                    >
                      <td className="py-2 px-3 text-grey-600 text-[12px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 px-3 text-[12px] whitespace-nowrap">
                        <Link
                          href={`/admin/users/${log.user_id}`}
                          className="text-blue-500 hover:underline font-mono"
                          title={log.user_id}
                        >
                          {log.user_id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-grey-900 break-all">
                        {log.program_title ?? "—"}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-2 px-3 text-grey-600 text-[12px] break-all">
                        {log.error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 카톡 카드 미리보기 — 사용자가 받게 될 알림 사전 시각 확인 (#8) */}
        <section className="mb-8">
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">
            카톡 카드 미리보기
          </h2>
          <p className="text-[13px] text-grey-600 mb-4 leading-[1.6]">
            POLICY_NEW (v2) · POLICY_NEW_V3 양 템플릿. 변수 입력 → 사용자가 카카오톡으로
            받을 카드 즉시 시각화. 발송 안 함 — 디자인 검토·심사 반려 대비.
          </p>
          <AlimtalkPreviewCard />
        </section>

        {/* 테스트 발송 폼 */}
        <section className="mb-8">
          <h2 className="text-[18px] font-bold text-grey-900 mb-3">
            테스트 발송
          </h2>
          <p className="text-[13px] text-grey-600 mb-4 leading-[1.6]">
            POLICY_NEW 템플릿으로 즉시 발송합니다. 본인 번호 입력 후 카카오톡으로
            실제 수신되는지 확인하세요. 결과(성공/실패 사유)는 아래에 바로 표시됩니다.
          </p>
          <AlimtalkTestForm />
        </section>

        <p className="mt-10 text-[13px] flex items-center gap-4">
          <Link
            href="/admin/alert-simulator"
            className="text-blue-500 font-medium underline"
          >
            발송 대상 시뮬레이션 →
          </Link>
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
        </p>
      </div>
    </main>
  );
}

// 7일 일자별 sent/failed 누적 막대 그래프 — 외부 라이브러리 없이 inline SVG.
// 가로 7칸, 각 칸에 sent(파란) + failed(빨간) 누적. 0건이면 회색 점선.
function DailyBarChart({ buckets }: { buckets: DailyBucket[] }) {
  const maxVal = Math.max(
    1, // 0 으로 나누기 방지
    ...buckets.map((b) => b.sent + b.failed),
  );
  const barW = 32; // 막대 너비
  const gap = 12;
  const chartH = 80;
  const chartW = buckets.length * (barW + gap);

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={chartH + 36} aria-label="최근 7일 발송 추이">
        {buckets.map((b, idx) => {
          const x = idx * (barW + gap);
          const total = b.sent + b.failed;
          const sentH = total > 0 ? (b.sent / maxVal) * chartH : 0;
          const failedH = total > 0 ? (b.failed / maxVal) * chartH : 0;

          return (
            <g key={b.date}>
              {total === 0 ? (
                // 데이터 없음 — 회색 점선 placeholder
                <line
                  x1={x + 2}
                  y1={chartH - 1}
                  x2={x + barW - 2}
                  y2={chartH - 1}
                  stroke="#d4d4d8"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              ) : (
                <>
                  {/* failed 위쪽 (빨강) */}
                  {b.failed > 0 && (
                    <rect
                      x={x}
                      y={chartH - sentH - failedH}
                      width={barW}
                      height={failedH}
                      fill="#ef4444"
                      rx="2"
                    >
                      <title>{`${b.label} — 실패 ${b.failed}건`}</title>
                    </rect>
                  )}
                  {/* sent 아래쪽 (파랑) */}
                  {b.sent > 0 && (
                    <rect
                      x={x}
                      y={chartH - sentH}
                      width={barW}
                      height={sentH}
                      fill="#3b82f6"
                      rx="2"
                    >
                      <title>{`${b.label} — 성공 ${b.sent}건`}</title>
                    </rect>
                  )}
                </>
              )}
              {/* x축 라벨 */}
              <text
                x={x + barW / 2}
                y={chartH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#71717a"
              >
                {b.label}
              </text>
              {/* 합계 숫자 */}
              {total > 0 && (
                <text
                  x={x + barW / 2}
                  y={chartH + 28}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#3f3f46"
                  fontWeight="600"
                >
                  {total}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* 범례 */}
      <div className="mt-2 flex gap-4 text-[12px] text-grey-700">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
          성공
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red" />
          실패
        </span>
      </div>
    </div>
  );
}

// 통계 카드 — 숫자 강조, tone 별 색상
function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "muted" | "neutral";
}) {
  const toneClass = {
    success: "border-blue-200 bg-blue-50 text-blue-900",
    danger: "border-red/30 bg-red/5 text-red",
    muted: "border-grey-200 bg-grey-50 text-grey-700",
    neutral: "border-grey-200 bg-white text-grey-900",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-[13px] font-semibold mb-1">{label}</p>
      <p className="text-[24px] font-extrabold tracking-[-0.5px]">{value}</p>
    </div>
  );
}

// 발송 로그 row 의 status 를 뱃지로 — 한 눈에 성공/실패 구분.
// 4개 상태 (queued/sent/failed/skipped) 중 현재는 주로 sent·failed·skipped 노출.
function StatusBadge({ status }: { status: string }) {
  const LABEL: Record<string, string> = {
    sent: "성공",
    failed: "실패",
    skipped: "건너뜀",
    queued: "대기",
  };
  const CLASS: Record<string, string> = {
    sent: "bg-blue-50 text-blue-700",
    failed: "bg-red/10 text-red",
    skipped: "bg-yellow-50 text-yellow-800",
    queued: "bg-grey-100 text-grey-700",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${CLASS[status] ?? "bg-grey-100 text-grey-700"}`}
    >
      {LABEL[status] ?? status}
    </span>
  );
}
