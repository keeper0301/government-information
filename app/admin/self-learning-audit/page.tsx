// ============================================================
// /admin/self-learning-audit — 자가 진화 학습 cron 7주 audit page (P3 #4)
// ============================================================
// admin_actions 에서 학습 cron 3종 (press_confidence_tune / popularity_weights_tune /
// self_learning_digest) 49일 (7주) 발화 이력 표 형식.
// SelfLearningCard timeline 의 확장 + 사장님 SQL 직접 안 짜도 audit 가시화.
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LEARNING_ACTIONS = [
  "press_confidence_tune_run",
  "popularity_weights_tune_run",
  "self_learning_digest_run",
] as const;

const ACTION_LABEL: Record<string, string> = {
  press_confidence_tune_run: "📊 press confidence (Spec 1)",
  popularity_weights_tune_run: "⚖️ popularity weights (Spec 2)",
  self_learning_digest_run: "📨 주간 다이제스트 (Spec 3)",
};

type AuditRow = {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> | null;
};

export default async function SelfLearningAuditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) redirect("/");

  const admin = createAdminClient();
  // eslint-disable-next-line react-hooks/purity -- server render 시 요청 시점 기준 49일 audit 범위(매 요청 정상)
  const since49d = new Date(Date.now() - 49 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("admin_actions")
    .select("id, action, created_at, details")
    .in("action", LEARNING_ACTIONS as unknown as string[])
    .gte("created_at", since49d)
    .order("created_at", { ascending: false })
    .limit(200);

  const runs: AuditRow[] = (rows ?? []) as AuditRow[];

  // 액션별 누적 카운트 (7주)
  const counts: Record<string, number> = {};
  for (const r of runs) counts[r.action] = (counts[r.action] ?? 0) + 1;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20 px-5">
      <div className="max-w-[960px] mx-auto">
        <div className="mb-6">
          <a
            href="/admin/autonomous"
            className="text-[13px] text-grey-600 no-underline hover:text-grey-700"
          >
            ← 자율 운영 hub
          </a>
          <h1 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 mt-3 tracking-[-0.5px]">
            🤖 자가 진화 학습 audit (7주)
          </h1>
          <p className="text-[14px] text-grey-700 mt-2">
            매주 월 새벽 학습 cron 3종 발화 이력. 7주 동안 액션별 누적 + 최근 200건.
          </p>
        </div>

        {/* 요약 */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5 mb-5">
          <h2 className="text-[15px] font-bold text-grey-900 mb-3">
            7주 누적 (액션별)
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            {LEARNING_ACTIONS.map((a) => (
              <li
                key={a}
                className="rounded border border-grey-100 px-3 py-2"
              >
                <div className="text-grey-600 text-[12px]">{ACTION_LABEL[a]}</div>
                <div className="text-[18px] font-extrabold text-grey-900 mt-1">
                  {counts[a] ?? 0}회
                </div>
                <div className="text-[11px] text-grey-500 mt-1">
                  예상 ~7회 (매주 1회 × 7주)
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 최근 200건 */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5">
          <h2 className="text-[15px] font-bold text-grey-900 mb-3">
            최근 발화 ({runs.length}건)
          </h2>
          {error && (
            <p className="text-[13px] text-red-600 mb-3">
              ⚠️ audit fetch 실패: {error.message}
            </p>
          )}
          {runs.length === 0 ? (
            <p className="text-[13px] text-grey-600">
              7주 동안 학습 cron 발화 기록 없음. Vercel cron 가동 또는 첫 cycle
              아직 미발화.
            </p>
          ) : (
            <ul className="divide-y divide-grey-100 text-[13px]">
              {runs.map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-grey-700 text-[12px]">
                      {r.created_at.replace("T", " ").slice(0, 16)}
                    </span>
                    <span className="text-grey-900">
                      {ACTION_LABEL[r.action] ?? r.action}
                    </span>
                  </div>
                  {r.details && Object.keys(r.details).length > 0 && (
                    <pre className="mt-1 text-[11px] text-grey-600 bg-grey-50 rounded px-2 py-1 overflow-x-auto">
                      {JSON.stringify(r.details, null, 0).slice(0, 400)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
