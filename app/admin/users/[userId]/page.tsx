// ============================================================
// /admin/users/[userId] — 사용자 상세 패널 (운영 디버깅용)
// ============================================================
// 표시:
//   - 기본 정보 (이메일, 가입일, 마지막 로그인, Supabase 대시보드 링크)
//   - 프로필 (나이대·지역·직업·관심분야)
//   - 구독 상태 (tier, status, current_period_end, trial_ends_at)
//   - AI 사용량 (지난 30일, 일별) + "오늘 쿼터 초기화" 액션
//   - 동의 현황 (5종: 방침·약관·마케팅·민감·카톡)
//   - 알림 발송 이력 (지난 30일)
//
// 액션 (server action, 어드민 재확인):
//   - resetAiQuotaToday(userId) — 오늘 date 의 ai_usage_log.count = 0
//
// 보안:
//   - 비로그인 → /login
//   - 어드민 아니면 → /
//   - 데이터 조회는 service_role (RLS 우회)로
// ============================================================

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { getUserConsents, type ConsentStatus } from "@/lib/consent";
import {
  getTargetActions,
  logAdminAction,
  ACTION_LABELS,
  type AdminActionRecord,
} from "@/lib/admin-actions";

export const metadata: Metadata = {
  title: "사용자 상세 | 어드민 | 정책알리미",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.id)) redirect("/");
  return user;
}

// ━━ Server Action: 오늘 날짜 AI 쿼터 초기화 ━━
// 사용 시나리오: "챗봇이 응답을 안 해요. 5번 밖에 안 썼는데…" 문의 대응.
// 오늘(KST) 행의 count 만 0 으로. DELETE 가 아니라 UPDATE — 감사 로그 의도.
// 어드민 권한은 action 내부에서도 다시 확인 (CSRF·직접 호출 방지).
async function resetAiQuotaToday(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return;

  const admin = createAdminClient();
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);

  const { error } = await admin
    .from("ai_usage_log")
    .update({ count: 0, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("date", today);

  if (error) {
    // 어드민 1명 운영이라 화면 표시 대신 서버 로그로 추적 (Vercel logs)
    console.error("[admin/reset-ai-quota] 실패:", {
      userId,
      today,
      message: error.message,
    });
  } else {
    // 감사 로그 — 실제 DB 업데이트가 성공했을 때만 기록.
    // 로그 저장 실패는 조용히 warn (메인 작업은 이미 성공했으니 block 안 함)
    try {
      await logAdminAction({
        actorId: actor.id,
        targetUserId: userId,
        action: "reset_ai_quota",
        details: { date: today },
      });
    } catch (logErr) {
      console.warn("[admin/reset-ai-quota] 감사 로그 기록 실패:", logErr);
    }
  }

  revalidatePath(`/admin/users/${userId}`);
}

// NEXT_PUBLIC_SUPABASE_URL(https://{ref}.supabase.co) 에서 project ref 추출.
// auth.users 대시보드 직링크 만들 때 사용.
function getSupabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const m = url.match(/^https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? null;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;

  const admin = createAdminClient();

  // 1) 기본 사용자 정보 (auth.users)
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) notFound();
  const u = authUser.user;

  // 2) 프로필 + 구독 + AI 사용량 + 알림 이력 (병렬)
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since30Date = since30.slice(0, 10);
  // 오늘(KST) — AI 쿼터 초기화 버튼 노출 조건 판정에 사용
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: subscription },
    { data: aiUsage },
    { data: alertDeliveries },
    consents,
    adminActions,
  ] = await Promise.all([
    admin.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("ai_usage_log")
      .select("date, count, updated_at")
      .eq("user_id", userId)
      .gte("date", since30Date)
      .order("date", { ascending: false }),
    admin
      .from("alert_deliveries")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", since30)
      .order("created_at", { ascending: false })
      .limit(50),
    getUserConsents(userId),
    getTargetActions(userId, 20),
  ]);

  const projectRef = getSupabaseProjectRef();

  const totalAi30 = (aiUsage ?? []).reduce(
    (s: number, r: { count: number }) => s + (r.count ?? 0),
    0,
  );
  // 오늘 사용 기록이 있을 때만 "쿼터 초기화" 버튼 의미 있음 (0회면 누를 필요 없음)
  const todayUsage = (aiUsage ?? []).find(
    (r: { date: string; count: number }) => r.date === todayKst,
  );
  const hasUsageToday = !!todayUsage && todayUsage.count > 0;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[860px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-burgundy font-semibold tracking-[0.2em] mb-2">
              ADMIN · 사용자 상세
            </p>
            <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-grey-900">
              {u.email ?? "(이메일 없음)"}
            </h1>
            <p className="text-[12px] text-grey-600 mt-1 font-mono">{u.id}</p>
          </div>
          <Link
            href="/admin"
            className="text-[13px] text-blue-500 hover:underline"
          >
            ← 검색
          </Link>
        </div>

        {/* 패널 그리드 */}
        <div className="space-y-5">

          {/* 기본 정보 */}
          <Panel title="기본 정보">
            <Row label="이메일" value={u.email} />
            <Row label="가입일" value={fmtDate(u.created_at)} />
            <Row label="마지막 로그인" value={fmtDate(u.last_sign_in_at)} />
            <Row label="이메일 인증" value={u.email_confirmed_at ? "✓ 완료" : "미완료"} />
            <Row
              label="OAuth 제공자"
              value={u.app_metadata?.providers ? fmt(u.app_metadata.providers) : "—"}
            />
            {projectRef && (
              <div className="mt-3 pt-3 border-t border-grey-100 text-[13px]">
                <a
                  href={`https://supabase.com/dashboard/project/${projectRef}/auth/users`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  Supabase 대시보드에서 열기 ↗
                </a>
              </div>
            )}
          </Panel>

          {/* 프로필 */}
          <Panel title="프로필">
            <Row label="나이대" value={profile?.age_group} />
            <Row label="지역" value={profile?.region} />
            <Row label="직업" value={profile?.occupation} />
            <Row label="관심 분야" value={profile?.interests} />
          </Panel>

          {/* 구독 */}
          <Panel title="구독 상태">
            <Row label="티어" value={subscription?.tier ?? "free"} />
            <Row label="상태" value={subscription?.status} />
            <Row label="체험 종료" value={fmtDate(subscription?.trial_ends_at)} />
            <Row label="다음 결제" value={fmtDate(subscription?.current_period_end)} />
          </Panel>

          {/* 동의 현황 — 5종 (필수 2 + 선택 3) */}
          <Panel title="동의 현황">
            <ConsentsRows consents={consents} />
          </Panel>

          {/* AI 사용량 */}
          <Panel title={`AI 사용량 (지난 30일, 총 ${totalAi30}회)`}>
            {/* 오늘 쿼터 초기화 액션 — "챗봇 안 돼요" 문의 대응용.
                오늘 사용 기록이 1회 이상일 때만 노출 (0회면 누를 필요 없음). */}
            {hasUsageToday && (
              <form action={resetAiQuotaToday} className="mb-3">
                <input type="hidden" name="userId" value={userId} />
                <button
                  type="submit"
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-grey-300 bg-white text-grey-700 hover:bg-grey-50 cursor-pointer"
                >
                  오늘 AI 상담 사용 횟수 리셋 (
                  {todayUsage?.count ?? 0}회 → 0회)
                </button>
              </form>
            )}
            {(aiUsage ?? []).length === 0 ? (
              <p className="text-[14px] text-grey-600 py-2">사용 기록 없음</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-grey-600 border-b border-grey-200">
                    <th className="py-2 font-medium">날짜</th>
                    <th className="py-2 font-medium text-right">호출 수</th>
                    <th className="py-2 font-medium text-right">마지막 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {(aiUsage ?? []).map(
                    (r: { date: string; count: number; updated_at: string }) => (
                      <tr
                        key={r.date}
                        className="border-b border-grey-100 last:border-b-0"
                      >
                        <td className="py-2">{r.date}</td>
                        <td className="py-2 text-right font-mono">{r.count}</td>
                        <td className="py-2 text-right text-grey-600 text-[12px]">
                          {fmtDate(r.updated_at)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 알림 이력 */}
          <Panel title={`알림 발송 이력 (지난 30일, 최대 50건)`}>
            {(alertDeliveries ?? []).length === 0 ? (
              <p className="text-[14px] text-grey-600 py-2">발송 이력 없음</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-grey-600 border-b border-grey-200">
                    <th className="py-2 font-medium">시각</th>
                    <th className="py-2 font-medium">채널</th>
                    <th className="py-2 font-medium">정책 ID</th>
                    <th className="py-2 font-medium">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {(alertDeliveries ?? []).map(
                    (d: {
                      id: string;
                      created_at: string;
                      channel?: string;
                      program_id?: string;
                      status?: string;
                      result?: string;
                    }) => (
                      <tr
                        key={d.id}
                        className="border-b border-grey-100 last:border-b-0"
                      >
                        <td className="py-2 text-grey-600 text-[12px]">
                          {fmtDate(d.created_at)}
                        </td>
                        <td className="py-2">{fmt(d.channel)}</td>
                        <td className="py-2 font-mono text-[12px]">
                          {fmt(d.program_id)}
                        </td>
                        <td className="py-2">{fmt(d.status ?? d.result)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 관리자 액션 로그 — 이 사용자 대상 최근 20건 */}
          <Panel title="관리자 액션 로그 (최근 20건)">
            <AdminActionsRows actions={adminActions} />
          </Panel>

        </div>
      </div>
    </main>
  );
}

// ━━━ 작은 컴포넌트 ━━━

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-grey-100 rounded-xl p-5">
      <h2 className="text-[14px] font-bold text-grey-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-grey-100 last:border-b-0">
      <div className="w-[120px] flex-shrink-0 text-[13px] text-grey-600">{label}</div>
      <div className="flex-1 text-[14px] text-grey-900 break-all">
        {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
      </div>
    </div>
  );
}

// 동의 5종 표시. 기록 있으면 버전·날짜·활성 여부, 없으면 "기록 없음".
function ConsentsRows({ consents }: { consents: ConsentStatus[] }) {
  const TYPES: Array<{ type: ConsentStatus["consentType"]; label: string }> = [
    { type: "privacy_policy", label: "개인정보처리방침" },
    { type: "terms", label: "이용약관" },
    { type: "marketing", label: "마케팅 수신" },
    { type: "sensitive_topic", label: "민감 토픽" },
    { type: "kakao_messaging", label: "카카오 알림톡" },
  ];
  const byType = new Map(consents.map((c) => [c.consentType, c]));

  return (
    <div>
      {TYPES.map(({ type, label }) => {
        const c = byType.get(type);
        const dateStr = c
          ? new Date(c.consentedAt).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
            })
          : null;
        return (
          <div
            key={type}
            className="flex items-center gap-3 py-2 border-b border-grey-100 last:border-b-0 text-[13px]"
          >
            <div className="w-[140px] flex-shrink-0 text-grey-700">{label}</div>
            <div className="flex-1">
              {c ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      c.isActive
                        ? "bg-blue-50 text-blue-600"
                        : "bg-grey-100 text-grey-600"
                    }`}
                  >
                    {c.isActive ? "active" : "withdrawn"}
                  </span>
                  <span className="text-grey-600 font-mono text-[12px]">
                    v{c.version}
                  </span>
                  <span className="text-grey-600 text-[12px]">{dateStr}</span>
                </div>
              ) : (
                <span className="text-grey-400">기록 없음</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 관리자 액션 로그 테이블. 시각·액션·세부정보(JSON) 표시.
// 빈 배열이면 "기록 없음" 안내.
function AdminActionsRows({ actions }: { actions: AdminActionRecord[] }) {
  if (actions.length === 0) {
    return <p className="text-[14px] text-grey-600 py-2">관리 액션 기록 없음</p>;
  }

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-grey-600 border-b border-grey-200">
          <th className="py-2 font-medium">시각</th>
          <th className="py-2 font-medium">액션</th>
          <th className="py-2 font-medium">세부</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((a) => (
          <tr
            key={a.id}
            className="border-b border-grey-100 last:border-b-0 align-top"
          >
            <td className="py-2 text-grey-600 text-[12px] whitespace-nowrap">
              {fmtDate(a.createdAt)}
            </td>
            <td className="py-2 font-medium text-grey-900">
              {ACTION_LABELS[a.action] ?? a.action}
            </td>
            <td className="py-2 text-grey-700 text-[12px] font-mono break-all">
              {a.details ? JSON.stringify(a.details) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
