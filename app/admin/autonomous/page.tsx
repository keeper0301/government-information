// ============================================================
// /admin/autonomous — 자율 운영 마스터 5 Phase hub
// ============================================================
// 사장님 매일 1번 클릭 = 평시 0분 운영 모드 달성.
// 5 Phase 가동 상태 + 24h 활동 요약 + 외부 액션 미완료 가이드.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  getAllPhaseStatuses,
  type PhaseStatus,
} from "@/lib/autonomous-ops/status";

export const metadata: Metadata = {
  title: "자율 운영 마스터 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/autonomous");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminAutonomousPage() {
  await requireAdmin();
  const phases = await getAllPhaseStatuses();
  const activeCount = phases.filter((p) => p.active).length;
  const pendingCount = phases.reduce(
    (sum, p) => sum + p.pendingActions.length,
    0,
  );

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="자율 운영 마스터"
        description={`5 Phase 중 ${activeCount}개 가동 · 외부 액션 ${pendingCount}건 대기. 매일 1번 점검 권장.`}
      />

      <div className="space-y-3">
        {phases.map((p) => (
          <PhaseCard key={p.phase} status={p} />
        ))}
      </div>

      <p className="mt-6 text-xs text-grey-600">
        spec 문서: <code>docs/superpowers/specs/2026-05-08-autonomous-ops-master-design.md</code>
        {" · "}
        Phase 진행 메모리: <code>memory/project_keepioo_autonomous_ops_master_2026_05_08.md</code>
      </p>
    </div>
  );
}

function PhaseCard({ status }: { status: PhaseStatus }) {
  const tone = status.active
    ? "border-green-200 bg-green-50/40"
    : "border-amber-200 bg-amber-50/40";
  const badge = status.active
    ? "bg-green-100 text-green-800"
    : "bg-amber-100 text-amber-800";
  return (
    <section className={`rounded-lg border p-4 ${tone}`}>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">
          Phase {status.phase} — {status.title}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${badge}`}>
          {status.active ? "✓ 가동" : "⚠ 외부 액션 대기"}
        </span>
      </header>

      <ul className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm mb-3">
        {status.metrics.map((m) => (
          <li
            key={m.label}
            className="rounded border border-grey-200 bg-white px-2 py-1"
          >
            <div className="text-[11px] text-grey-600">{m.label}</div>
            <div className="font-medium">{m.value}</div>
          </li>
        ))}
      </ul>

      {status.pendingActions.length > 0 && (
        <div className="rounded border border-amber-200 bg-white p-2">
          <div className="text-[11px] font-semibold text-amber-800 mb-1">
            사장님 외부 액션 ({status.pendingActions.length}건)
          </div>
          <ol className="text-xs text-grey-800 list-decimal pl-4 space-y-0.5">
            {status.pendingActions.map((a, i) => (
              <li key={i}>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    {a.text} ↗
                  </a>
                ) : (
                  a.text
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
