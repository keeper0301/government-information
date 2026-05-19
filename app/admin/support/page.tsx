// ============================================================
// /admin/support — 사용자 CS 큐 (Phase 4 자율 운영)
// ============================================================
// 사용자 문의 → support_tickets 큐 → 사장님 답변. intent 분류·자동 응답·상태
// 모두 한 페이지에서 가시화.
//
// 표시 항목:
//   1. 24h KPI 5종 — 신규 / 자동 응답 / 답변 대기 / 답변 완료 / intent 분포
//   2. 답변 대기 큐 (status=open) — 우선 답변 대상
//   3. 최근 30건 (모든 status) — 자동 응답·답변 완료도 추적
//
// 권한: ADMIN 가드 (isAdminUser). robots noindex.
// 답변 작성: SupportReplyForm (server action) — 별도 컴포넌트
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SupportReplyForm } from "./reply-form";

export const metadata: Metadata = {
  title: "고객 문의 큐 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Ticket {
  id: string;
  user_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string | null;
  message: string;
  intent: string;
  intent_confidence: number | null;
  intent_reason: string | null;
  status: string;
  auto_response: string | null;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/support");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

const STATUS_LABEL: Record<string, string> = {
  open: "답변 대기",
  auto_replied: "자동 응답",
  replied: "답변 완료",
  closed: "종료",
};

const INTENT_LABEL: Record<string, string> = {
  refund_request: "환불 요청",
  refund_policy_question: "환불 정책 문의",
  account_recovery: "계정 복구",
  account_delete: "탈퇴",
  bug_report: "버그",
  feature_request: "기능 요청",
  policy_question: "정책 검색",
  pricing_question: "요금제 문의",
  other: "기타",
};

export default async function SupportPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const generatedAt = new Date();
  const since24h = new Date(
    generatedAt.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // 24h KPI
  const [count24h, autoReplied24h, openTotal, repliedToday] = await Promise.all([
    admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "auto_replied")
      .gte("created_at", since24h),
    admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "replied")
      .gte("replied_at", since24h),
  ]);

  // 답변 대기 큐 (open) — 우선 처리 대상
  const { data: openTickets } = await admin
    .from("support_tickets")
    .select(
      "id, user_id, contact_email, contact_phone, subject, message, intent, intent_confidence, intent_reason, status, auto_response, reply, replied_at, created_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(50);

  // 최근 30건 (모든 status — 자동 응답·답변 완료도 추적)
  const { data: recentTickets } = await admin
    .from("support_tickets")
    .select(
      "id, user_id, contact_email, subject, message, intent, intent_confidence, status, auto_response, reply, replied_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(30);

  // intent 분포 24h (KPI 카드 보조)
  const { data: intent24h } = await admin
    .from("support_tickets")
    .select("intent")
    .gte("created_at", since24h);
  const intentCounts: Record<string, number> = {};
  for (const r of intent24h ?? []) {
    const k = (r as { intent: string }).intent;
    intentCounts[k] = (intentCounts[k] ?? 0) + 1;
  }
  const topIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[1100px] mx-auto px-5">
        <AdminPageHeader
          kicker="ADMIN · CS"
          title="고객 문의 큐"
          description="사용자 문의 자동 분류 + 답변 대기 + 자동 응답 추적. /admin/support."
        />

        {/* KPI 카드 5 */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Kpi label="24h 신규" value={`${count24h.count ?? 0}건`} />
          <Kpi
            label="24h 자동 응답"
            value={`${autoReplied24h.count ?? 0}건`}
            tone="ok"
          />
          <Kpi
            label="답변 대기"
            value={`${openTotal.count ?? 0}건`}
            tone={(openTotal.count ?? 0) >= 1 ? "warn" : "muted"}
          />
          <Kpi
            label="24h 답변 완료"
            value={`${repliedToday.count ?? 0}건`}
            tone="ok"
          />
          <Kpi
            label="24h 인기 intent"
            value={topIntent ? `${INTENT_LABEL[topIntent[0]] ?? topIntent[0]} ${topIntent[1]}` : "—"}
          />
        </section>

        {/* 답변 대기 큐 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-grey-900 mb-3">
            답변 대기 ({openTickets?.length ?? 0})
          </h2>
          {(openTickets?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-grey-200 bg-white p-5 text-sm text-grey-600">
              ✓ 모든 문의 처리 완료.
            </div>
          ) : (
            <div className="space-y-3">
              {(openTickets ?? []).map((t) => (
                <TicketCard key={t.id} ticket={t as Ticket} editable />
              ))}
            </div>
          )}
        </section>

        {/* 최근 30건 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-grey-900 mb-3">최근 30건</h2>
          {(recentTickets?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-grey-200 bg-white p-5 text-sm text-grey-600">
              아직 문의 없음.
            </div>
          ) : (
            <div className="space-y-3">
              {(recentTickets ?? []).map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t as Ticket}
                  editable={(t as Ticket).status === "open"}
                />
              ))}
            </div>
          )}
        </section>

        <p className="mt-10 text-sm">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
        </p>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const cls =
    tone === "warn"
      ? "border-red/30 bg-red/5 text-red"
      : tone === "ok"
        ? "border-blue-200 bg-blue-50 text-blue-900"
        : "border-grey-200 bg-grey-50 text-grey-700";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-xs font-semibold mb-1">{label}</p>
      <p className="text-lg font-extrabold tracking-[-0.5px] break-all">{value}</p>
    </div>
  );
}

function TicketCard({
  ticket,
  editable,
}: {
  ticket: Ticket;
  editable: boolean;
}) {
  const intentLabel = INTENT_LABEL[ticket.intent] ?? ticket.intent;
  const statusLabel = STATUS_LABEL[ticket.status] ?? ticket.status;
  const conf =
    ticket.intent_confidence !== null
      ? `${Math.round(ticket.intent_confidence * 100)}%`
      : "—";

  const statusTone =
    ticket.status === "open"
      ? "bg-amber-100 text-amber-900 border-amber-200"
      : ticket.status === "auto_replied"
        ? "bg-blue-100 text-blue-900 border-blue-200"
        : "bg-grey-100 text-grey-800 border-grey-200";

  return (
    <div className="rounded-lg border border-grey-200 bg-white p-4">
      <div className="flex items-start gap-3 mb-2 flex-wrap">
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded border ${statusTone}`}
        >
          {statusLabel}
        </span>
        <span className="text-xs font-mono text-grey-600">
          {intentLabel} · {conf}
        </span>
        <span className="text-xs text-grey-500 ml-auto whitespace-nowrap">
          {new Date(ticket.created_at).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </span>
      </div>

      {ticket.subject && (
        <p className="text-sm font-bold text-grey-900 mb-1">{ticket.subject}</p>
      )}
      <p className="text-sm text-grey-800 whitespace-pre-wrap mb-2 break-all">
        {ticket.message}
      </p>

      <p className="text-xs text-grey-500 mb-2">
        {ticket.user_id ? `로그인 사용자` : `익명 — ${ticket.contact_email ?? "(이메일 없음)"}`}
        {ticket.contact_phone ? ` · ${ticket.contact_phone}` : ""}
      </p>

      {ticket.intent_reason && (
        <p className="text-xs text-grey-600 italic mb-2">
          분류 근거: {ticket.intent_reason}
        </p>
      )}

      {ticket.auto_response && (
        <div className="mb-2 rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900 whitespace-pre-wrap">
          [자동 응답]
          {"\n"}
          {ticket.auto_response}
        </div>
      )}

      {ticket.reply && (
        <div className="mb-2 rounded border border-grey-200 bg-grey-50 p-2 text-xs text-grey-800 whitespace-pre-wrap">
          [사장님 답변] {ticket.replied_at ? `(${new Date(ticket.replied_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})` : ""}
          {"\n"}
          {ticket.reply}
        </div>
      )}

      {editable && <SupportReplyForm ticketId={ticket.id} />}
    </div>
  );
}
