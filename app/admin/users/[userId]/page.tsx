// ============================================================
// /admin/users/[userId] — 사용자 상세 패널 (운영 디버깅용)
// ============================================================
// 표시:
//   - 기본 정보 (이메일, 가입일, 마지막 로그인)
//   - 프로필 (나이대·지역·직업·관심분야)
//   - 구독 상태 (tier, status, current_period_end, trial_ends_at)
//   - AI 사용량 (지난 30일, 일별)
//   - 알림 발송 이력 (지난 30일)
//
// 보안:
//   - 비로그인 → /login
//   - 어드민 아니면 → /
//   - 데이터 조회는 service_role (RLS 우회)로
// ============================================================

import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

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

  const [
    { data: profile },
    { data: subscription },
    { data: aiUsage },
    { data: alertDeliveries },
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
  ]);

  const totalAi30 = (aiUsage ?? []).reduce(
    (s: number, r: { count: number }) => s + (r.count ?? 0),
    0,
  );

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
            <p className="text-[12px] text-grey-500 mt-1 font-mono">{u.id}</p>
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

          {/* AI 사용량 */}
          <Panel title={`AI 사용량 (지난 30일, 총 ${totalAi30}회)`}>
            {(aiUsage ?? []).length === 0 ? (
              <p className="text-[14px] text-grey-500 py-2">사용 기록 없음</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-grey-500 border-b border-grey-200">
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
                        <td className="py-2 text-right text-grey-500 text-[12px]">
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
              <p className="text-[14px] text-grey-500 py-2">발송 이력 없음</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-grey-500 border-b border-grey-200">
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
                        <td className="py-2 text-grey-500 text-[12px]">
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
      <div className="w-[120px] flex-shrink-0 text-[13px] text-grey-500">{label}</div>
      <div className="flex-1 text-[14px] text-grey-900 break-all">
        {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
      </div>
    </div>
  );
}
