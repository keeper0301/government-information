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
import { getUserTimeline, type TimelineEvent } from "@/lib/user-timeline";
import {
  getTargetActions,
  logAdminAction,
  ACTION_LABELS,
  type AdminActionRecord,
} from "@/lib/admin-actions";
import { DeleteUserButton } from "./delete-button";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "사용자 상세 | 어드민 | 정책알리미",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.email)) redirect("/");
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

// ━━ Server Action: 어드민 수동 사용자 탈퇴 처리 ━━
// 사용 시나리오: "탈퇴 방법을 모르겠어요" / "로그인이 안 돼서 탈퇴 못 해요" 문의 대응.
// admin.auth.admin.deleteUser(targetUserId) 로 auth.users 삭제 → CASCADE 로 연관 데이터 전부 제거.
// 감사 로그는 삭제 전에 먼저 기록 — 삭제 후엔 target_user_id 가 NULL 로 되지만 action·actor 는 남음.
// 어드민 본인 삭제는 절대 금지 (UI 에서도 숨기지만 action 에서도 재확인 — 이중 방어).
async function deleteUserAsAdmin(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId) return;

  // 본인 삭제 차단 — 실수로 자기 계정 날리면 모든 관리 권한 잃음.
  // 기존엔 silent return 이라 form 강제 제출 시 사용자가 왜 안 되는지 몰랐음.
  // 이제는 상세 페이지로 error 쿼리 포함해 돌려보내 안내 박스 노출.
  if (targetUserId === actor.id) {
    console.warn("[admin/delete-user] 어드민 본인 삭제 시도 차단", {
      actorId: actor.id,
    });
    redirect(`/admin/users/${targetUserId}?error=self_delete_forbidden`);
  }

  const admin = createAdminClient();

  // 대상 이메일을 details 에 기록 (삭제 후엔 auth.users 에서 조회 불가)
  let targetEmail: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(targetUserId);
    targetEmail = data?.user?.email ?? null;
  } catch {
    // 조회 실패는 무시 (details 만 비워서 진행)
  }

  // 감사 로그 먼저 — 삭제 순간에 target_user_id 는 SET NULL 되지만 action/actor/details 는 영구
  try {
    await logAdminAction({
      actorId: actor.id,
      targetUserId,
      action: "manual_delete_user",
      details: { email: targetEmail },
    });
  } catch (logErr) {
    console.warn("[admin/delete-user] 감사 로그 실패:", logErr);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
  if (delErr) {
    console.error("[admin/delete-user] auth.users 삭제 실패:", {
      targetUserId,
      message: delErr.message,
    });
    // 실패 시 사용자 상세 페이지 유지 (redirect 안 함)
    revalidatePath(`/admin/users/${targetUserId}`);
    return;
  }

  // 성공 — /admin 검색 페이지로 이동 (현재 페이지는 404 가 될 것)
  redirect("/admin");
}

// ━━ Server Action: 구독 티어 수동 변경 ━━
// 사용 시나리오: "프로 결제가 승인됐는데 반영이 안 됐어요" / "체험 연장" 문의 대응.
// free/basic/pro 3티어. tier 만 바꾸고 상태(status)·결제일은 건드리지 않음
// (토스 결제 흐름과의 충돌 방지 — 실 결제 변경은 결제 플로우에서만).
// 동일 티어로 재설정 시 no-op.
async function updateUserTier(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const rawTier = String(formData.get("tier") ?? "").trim();
  if (!targetUserId) return;

  // 화이트리스트 — 타이피 변조·임의 값 주입 차단
  const VALID_TIERS = new Set(["free", "basic", "pro"]);
  if (!VALID_TIERS.has(rawTier)) return;
  const newTier = rawTier as "free" | "basic" | "pro";

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", targetUserId)
    .maybeSingle();

  const fromTier: "free" | "basic" | "pro" =
    (existing?.tier as "free" | "basic" | "pro" | undefined) ?? "free";
  if (fromTier === newTier) {
    // 변화 없으면 조용히 끝냄 — 감사 로그 오염 방지
    return;
  }

  if (existing) {
    const { error } = await admin
      .from("subscriptions")
      .update({ tier: newTier, updated_at: new Date().toISOString() })
      .eq("user_id", targetUserId);
    if (error) {
      console.error("[admin/update-tier] 기존 row update 실패:", {
        targetUserId,
        message: error.message,
      });
      return;
    }
  } else {
    // 기존 row 없음 → 수동 부여. status='manual_grant' 로 결제 흐름과 구분.
    const { error } = await admin.from("subscriptions").insert({
      user_id: targetUserId,
      tier: newTier,
      status: "manual_grant",
    });
    if (error) {
      console.error("[admin/update-tier] 신규 row insert 실패:", {
        targetUserId,
        message: error.message,
      });
      return;
    }
  }

  try {
    await logAdminAction({
      actorId: actor.id,
      targetUserId,
      action: "update_tier",
      details: {
        from: fromTier,
        to: newTier,
        prev_status: existing?.status ?? null,
      },
    });
  } catch (logErr) {
    console.warn("[admin/update-tier] 감사 로그 실패:", logErr);
  }

  revalidatePath(`/admin/users/${targetUserId}`);
}

// ━━ Server Action: 수동 알림 재전송 ━━
// 사용 시나리오: "알림이 안 왔어요" 문의 → 사용자의 활성 규칙 하나를 골라
// 최근 30일 매칭 공고를 즉시 이메일로 재전송. 카카오 알림톡은 이번 단계에서 제외
// (동의 체크·템플릿 변수 복잡도 대비 이메일 우선).
//
// 의도적으로 alert_deliveries 에는 기록하지 않음:
//   - UNIQUE(rule, program, channel) 로 cron 중복 방지 목적이 본래 용도
//   - 수동 재전송은 "사용자가 재요청한 예외" 라 cron 로직과 분리
//   - 감사 추적은 admin_actions.manual_alert_send 로 일원화
async function manualSendAlert(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const ruleId = String(formData.get("ruleId") ?? "").trim();
  if (!targetUserId || !ruleId) return;

  const admin = createAdminClient();

  // 1) 규칙 조회 + 본인 소유 확인 (URL 조작 방어)
  const { data: rule } = await admin
    .from("user_alert_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!rule || !rule.is_active) {
    console.warn("[admin/manual-alert-send] 규칙 없음·비활성:", { ruleId });
    return;
  }

  // 2) 대상 이메일 확보
  const { data: authData } = await admin.auth.admin.getUserById(targetUserId);
  const email = authData?.user?.email ?? null;
  if (!email) {
    console.warn("[admin/manual-alert-send] 이메일 없음:", { targetUserId });
    return;
  }

  // 3) 매칭 공고 조회 — 최근 30일
  const { findMatchingPrograms } = await import("@/lib/alerts/matching");
  const { sendCustomAlertEmail } = await import("@/lib/email");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const matches = await findMatchingPrograms(admin, rule, since, 10);

  let sent = 0;
  let errorMsg: string | null = null;

  if (matches.length > 0) {
    try {
      const { error } = await sendCustomAlertEmail({
        to: email,
        ruleName: rule.name,
        programs: matches.map((m) => ({
          id: m.id,
          title: m.title,
          source: m.source,
          applyUrl: m.apply_url,
          applyEnd: m.apply_end,
          table: m.table,
        })),
      });
      if (error) {
        errorMsg = String(error).slice(0, 200);
      } else {
        sent = matches.length;
      }
    } catch (sendErr) {
      errorMsg =
        sendErr instanceof Error ? sendErr.message.slice(0, 200) : "unknown";
    }
  }

  try {
    await logAdminAction({
      actorId: actor.id,
      targetUserId,
      action: "manual_alert_send",
      details: {
        rule_id: ruleId,
        rule_name: rule.name,
        channels: rule.channels,
        matches_count: matches.length,
        email_sent: sent,
        error: errorMsg,
      },
    });
  } catch (logErr) {
    console.warn("[admin/manual-alert-send] 감사 로그 실패:", logErr);
  }

  revalidatePath(`/admin/users/${targetUserId}`);
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
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireAdmin();
  const { userId } = await params;
  const { error: errorCode } = await searchParams;
  const isSelf = actor.id === userId;

  // server action 에서 self 삭제 차단된 경우 페이지 상단에 빨강 박스로 안내
  const selfDeleteBlocked = errorCode === "self_delete_forbidden" && isSelf;

  const admin = createAdminClient();

  // 1) 기본 사용자 정보 (auth.users)
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) notFound();
  const u = authUser.user;

  // 2) 프로필 + 구독 + AI 사용량 + 알림 이력 (병렬).
  // Server Component 에서 현재 시간 기준 쿼리 범위 계산. react-hooks/purity
  // 룰이 server context 를 구별 못해 false positive — 서버 요청당 1회만 평가.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const since30 = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since30Date = since30.slice(0, 10);
  // 오늘(KST) — AI 쿼터 초기화 버튼 노출 조건 판정에 사용
  const kstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: subscription },
    { data: aiUsage },
    { data: alertDeliveries },
    { data: alertRules },
    consents,
    adminActions,
    timeline,
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
    admin
      .from("user_alert_rules")
      .select("id, name, is_active, channels, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    getUserConsents(userId),
    getTargetActions(userId, 20),
    getUserTimeline(userId, 30),
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
        {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
        <AdminPageHeader
          kicker="ADMIN · 사용자"
          title={u.email ?? "(이메일 없음)"}
          description={
            <span className="font-mono text-[13px]">{u.id}</span>
          }
        />

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

            {/* 티어 수동 변경 — 문의 대응 (결제 반영 누락·체험 연장). 결제 흐름과
                분리된 수동 부여 경로. 선택된 티어가 현재와 같으면 action 이 no-op. */}
            <form
              action={updateUserTier}
              className="mt-4 pt-4 border-t border-grey-100 flex items-center gap-2 flex-wrap"
            >
              <input type="hidden" name="userId" value={userId} />
              <label className="text-[13px] font-medium text-grey-700">
                티어 변경:
                <select
                  name="tier"
                  defaultValue={(subscription?.tier as string) ?? "free"}
                  className="ml-2 px-2 py-1 text-[13px] border border-grey-300 rounded cursor-pointer"
                >
                  <option value="free">free</option>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                </select>
              </label>
              <button
                type="submit"
                className="text-[13px] font-semibold px-3 py-1.5 rounded-md border border-grey-300 bg-white text-grey-700 hover:bg-grey-50 cursor-pointer"
              >
                적용
              </button>
              <span className="text-[12px] text-grey-600">
                (현재와 동일 선택 시 변경 없음)
              </span>
            </form>
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
                  className="text-[13px] font-semibold px-3 py-1.5 rounded-md border border-grey-300 bg-white text-grey-700 hover:bg-grey-50 cursor-pointer"
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

          {/* 수동 알림 재전송 — 활성 규칙별 즉시 이메일 발송. 최근 30일 매칭 공고
              상위 10건을 한 번의 이메일로 묶어 보냄. alert_deliveries 는 건드리지 않아
              cron 중복 방지 UNIQUE 제약과 분리 (관리자 예외 경로). */}
          <Panel title={`알림 규칙 (${(alertRules ?? []).length}개) — 수동 재전송`}>
            {(alertRules ?? []).length === 0 ? (
              <p className="text-[14px] text-grey-600 py-2">등록된 규칙이 없어요</p>
            ) : (
              <div className="space-y-2">
                {(alertRules ?? []).map(
                  (r: {
                    id: string;
                    name: string;
                    is_active: boolean;
                    channels: string[] | null;
                  }) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-grey-100 last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[14px] font-semibold text-grey-900 truncate">
                            {r.name}
                          </span>
                          {!r.is_active && (
                            <span className="text-[11px] bg-grey-100 text-grey-700 px-1.5 py-0.5 rounded font-medium">
                              비활성
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-grey-600">
                          채널: {(r.channels ?? []).join(", ") || "—"}
                        </div>
                      </div>
                      {r.is_active ? (
                        <form action={manualSendAlert}>
                          <input type="hidden" name="userId" value={userId} />
                          <input type="hidden" name="ruleId" value={r.id} />
                          <button
                            type="submit"
                            className="text-[13px] font-semibold px-3 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                          >
                            지금 이메일 재전송
                          </button>
                        </form>
                      ) : (
                        <span className="text-[12px] text-grey-600 px-3">
                          (활성 시에만 가능)
                        </span>
                      )}
                    </div>
                  ),
                )}
                <p className="text-[12px] text-grey-600 mt-2 leading-[1.6]">
                  * 최근 30일 매칭 공고 상위 10건을 한 이메일로 묶어 발송해요.
                  카카오 알림톡은 이번 경로에서 제외(수동 재전송은 이메일만).
                  <br />* 감사 로그는 관리자 액션 로그 Panel 에 manual_alert_send 로 기록.
                </p>
              </div>
            )}
          </Panel>

          {/* 관리자 액션 로그 — 이 사용자 대상 최근 20건 */}
          <Panel title="관리자 액션 로그 (최근 20건)">
            <AdminActionsRows actions={adminActions} />
          </Panel>

          {/* 사용자 행동 timeline — admin_actions + alert_deliveries + consent_log 통합 */}
          <Panel title={`행동 timeline (최근 ${timeline.length}건)`}>
            <UserTimeline events={timeline} />
          </Panel>

          {/* 위험 작업 — 최하단 배치 (의도치 않은 접근 방지).
              본인 계정이면 DeleteUserButton 이 내부에서 안내문만 표시.
              server action 차원의 self 차단이 발동한 경우 별도 안내 박스. */}
          <section className="bg-white border border-red/30 rounded-xl p-5 mt-5">
            <h2 className="text-[16px] font-bold text-red mb-2 tracking-[-0.3px]">
              ⚠️ 위험 작업
            </h2>
            {selfDeleteBlocked && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] text-red leading-[1.6]"
              >
                <b>본인 계정은 이 페이지에서 탈퇴 처리할 수 없어요.</b>
                <br />
                운영 권한 손실을 막기 위한 안전장치입니다. 본인 탈퇴는{" "}
                <Link
                  href="/mypage"
                  className="underline hover:text-red/80 no-underline"
                >
                  마이페이지
                </Link>{" "}
                최하단의 &quot;회원 탈퇴&quot; 섹션을 이용해 주세요.
              </div>
            )}
            <p className="text-[13px] text-grey-700 mb-4 leading-[1.6]">
              이 사용자를 즉시 탈퇴 처리합니다. 프로필·구독·알림·AI 사용량·동의
              기록 등 모든 관련 데이터가 영구 삭제되며 복구할 수 없어요.
              <br />
              문의 대응 시 <b>반드시 사용자 본인 확인 후</b> 진행하세요.
            </p>
            <DeleteUserButton
              action={deleteUserAsAdmin}
              userId={userId}
              userEmail={u.email ?? null}
              isSelf={isSelf}
            />
          </section>

        </div>
      </div>
    </main>
  );
}

// ━━━ 작은 컴포넌트 ━━━

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-grey-100 rounded-xl p-5">
      <h2 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.2px]">{title}</h2>
      {children}
    </section>
  );
}

// 사용자 행동 timeline — 시간순 (최신 먼저)
function UserTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[13px] text-grey-600 py-2">기록된 활동이 없어요.</p>
    );
  }
  const dot = {
    ok: "bg-green",
    warn: "bg-amber-500",
    error: "bg-red",
    info: "bg-grey-400",
  } as const;
  const kindLabel = {
    admin: "👤",
    alert: "📨",
    consent: "✓",
  } as const;
  return (
    <ol className="space-y-2">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="flex items-start gap-3 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
        >
          <span
            className={`flex-shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${dot[ev.status ?? "info"]}`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-grey-900 leading-[1.4]">
              <span className="mr-1.5" aria-hidden="true">
                {kindLabel[ev.kind]}
              </span>
              {ev.summary}
            </div>
            {ev.detail && (
              <div className="text-[12px] text-grey-600 mt-0.5 truncate">
                {ev.detail}
              </div>
            )}
            <div className="text-[11px] text-grey-500 mt-0.5">
              {new Date(ev.ts).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </li>
      ))}
    </ol>
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
                <span className="text-grey-500">기록 없음</span>
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
