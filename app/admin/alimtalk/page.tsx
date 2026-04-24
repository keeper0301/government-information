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
// 권한: ADMIN_USER_IDS 환경변수에 포함된 user 만 접근. 그 외 / 로 redirect.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AlimtalkTestForm } from "./test-form";

export const metadata: Metadata = {
  title: "알림톡 운영 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type DeliveryRow = {
  status: "queued" | "sent" | "failed" | "skipped";
  error: string | null;
};

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

export default async function AlimtalkAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/alimtalk");
  if (!isAdminUser(user.id)) redirect("/");

  const stats = await collect24hStats();
  const providerConfigured = !!process.env.KAKAO_ALIMTALK_PROVIDER;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[820px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-burgundy font-semibold tracking-[0.2em] mb-3">
            ADMIN / ALIMTALK
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            카카오 알림톡 운영
          </h1>
          <p className="text-[14px] text-grey-600">
            최근 24시간 발송 현황과 테스트 발송 도구.
          </p>
        </div>

        {/* 대행사 설정 상태 배너 */}
        <div
          className={`mb-6 rounded-lg border p-4 text-[13px] leading-[1.6] ${
            providerConfigured
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-yellow-300 bg-yellow-50 text-yellow-900"
          }`}
        >
          {providerConfigured ? (
            <>
              ✅ <strong>KAKAO_ALIMTALK_PROVIDER</strong> 환경변수 설정됨
              (<code>{process.env.KAKAO_ALIMTALK_PROVIDER}</code>). 실제 발송 경로가
              활성화 상태입니다.
            </>
          ) : (
            <>
              ⚠️ <strong>KAKAO_ALIMTALK_PROVIDER</strong> 환경변수가 설정되지 않았습니다.
              현재 sendAlimtalk 은 <code>skipped_no_provider</code> 를 반환하고
              실제 발송은 이루어지지 않습니다. Vercel 대시보드에서 환경변수 5종을
              등록한 뒤 재배포해 주세요.
            </>
          )}
        </div>

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

        <p className="mt-10 text-[12px] flex items-center gap-4">
          <Link href="/admin" className="text-blue-500 underline">
            ← 어드민 홈
          </Link>
        </p>
      </div>
    </main>
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
      <p className="text-[12px] font-semibold mb-1">{label}</p>
      <p className="text-[24px] font-extrabold tracking-[-0.5px]">{value}</p>
    </div>
  );
}
