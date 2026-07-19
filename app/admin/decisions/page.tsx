// ============================================================
// /admin/decisions — 결정 보조 채널 (2026-05-22, C 옵션)
// ============================================================
// 텔레그램 /decide 명령 외 사장님 PC 에서 결정 처리 UI.
// SMS off (2026-05-21) 후 결정 답장 채널 1: 텔레그램 봇 · 2: 이 페이지
//
// 표시:
//   1. ?ok / ?error 메시지
//   2. 미결정 목록 카드 — kind / prompt / sent_at / 남은 시간 + 3 버튼
//
// 권한: ADMIN_EMAILS 가드. robots noindex.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { listPendingDecisions } from "@/lib/sms/decision-router";
import {
  approveDecisionAction,
  rejectDecisionAction,
  consultDecisionAction,
} from "./actions";

export const metadata: Metadata = {
  title: "결정 대기 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/decisions");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

function formatKst(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
}

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const pending = await listPendingDecisions();
  const nextExpiring = pending.reduce<(typeof pending)[number] | null>((earliest, item) => {
    if (!earliest) return item;
    return item.expires_at < earliest.expires_at ? item : earliest;
  }, null);

  return (
    <main className="max-w-[920px] mx-auto px-5 lg:px-10 pt-[80px] pb-20">
      <AdminPageHeader
        title="결정 대기"
        description="텔레그램 /decide 명령 외 PC 에서 처리. SMS off 후 사장님 결정 답장 채널 2."
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <DecisionSummaryCard
          label="처리 대기"
          value={`${pending.length}건`}
          hint={pending.length === 0 ? "지금 할 일 없음" : "아래 카드에서 바로 승인·무시·상의"}
          tone={pending.length > 0 ? "warn" : "ok"}
        />
        <DecisionSummaryCard
          label="다음 만료"
          value={nextExpiring ? `${formatKst(nextExpiring.expires_at)} KST` : "없음"}
          hint={nextExpiring ? `${nextExpiring.kind} · ${nextExpiring.id.slice(0, 8)}` : "대기 중인 결정 없음"}
          tone={nextExpiring ? "warn" : "ok"}
        />
        <DecisionSummaryCard
          label="권장 순서"
          value={pending.length > 0 ? "만료 임박순" : "대기 없음"}
          hint="위험한 액션은 승인 전 prompt 확인"
        />
      </section>

      {ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4 text-[13px] text-emerald-900">
          ✅ 처리 완료: {ok}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 text-[13px] text-red-900">
          ⚠️ 처리 실패: {error}
        </div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-xl border border-grey-200 bg-grey-50 px-6 py-10 text-center">
          <p className="text-[15px] text-grey-700">
            ✅ 미결정 결정 없음. 모두 처리됐어요.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-grey-600">총 {pending.length}건</p>
          {pending.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-grey-200 bg-white p-5"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 rounded">
                  {p.kind}
                </span>
                <span className="text-[12px] text-grey-500 font-mono">
                  {p.id.slice(0, 8)}
                </span>
                <span className="text-[12px] text-grey-500">
                  · {formatKst(p.sent_at)} KST
                </span>
                <span className="text-[12px] text-amber-700">
                  · 만료 {formatKst(p.expires_at)} KST
                </span>
              </div>
              <p className="text-[14px] text-grey-900 leading-[1.6] mb-4 whitespace-pre-wrap">
                {p.prompt}
              </p>
              <div className="flex gap-2 flex-wrap">
                <form action={approveDecisionAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 text-[13px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                  >
                    ✅ 승인 (액션 실행)
                  </button>
                </form>
                <form action={rejectDecisionAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 text-[13px] font-semibold text-grey-700 bg-grey-100 rounded-lg hover:bg-grey-200"
                  >
                    🚫 무시
                  </button>
                </form>
                <form action={consultDecisionAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 text-[13px] font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    💬 상의 표시
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-xl border border-grey-200 bg-grey-50 px-5 py-4">
        <p className="text-[12px] text-grey-600 leading-[1.6]">
          💡 같은 결정을 텔레그램 봇에서도 처리 가능:
          <br />
          <code className="text-[11px]">/decide</code> (목록) ·
          <code className="text-[11px]"> /decide approve {`{앞 8자 id}`}</code>
        </p>
      </div>
    </main>
  );
}

function DecisionSummaryCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-grey-200 bg-grey-50 text-grey-900";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-70">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-extrabold tracking-[-0.02em]">
        {value}
      </div>
      <div className="mt-1 text-[12px] leading-[1.4] opacity-80">{hint}</div>
    </div>
  );
}
