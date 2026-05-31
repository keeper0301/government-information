// ============================================================
// /admin/self-learning-override — 학습 결과 수동 override (P3 #1)
// ============================================================
// 사장님 긴급 모드: 학습 cron 결과 마음에 안 들 때 즉시 강제 변경.
//   - press tier_floor: high/mid/low 강제
//   - popularity weights: view/apply/max_boost 강제
//
// applied_by='manual_override' 으로 history table 새 row insert (append-only).
// 학습 cron 의 다음 발화 시 데이터 기반으로 다시 결정 (override 가 영구 아님).
// 만료 만들고 싶으면 별도 cron 또는 사장님이 다시 manual 적용.
// ============================================================

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { _resetTierFloorCache } from "@/lib/press-ingest/auto-confirm-settings";
import { _resetWeightsCache } from "@/lib/personalization/popularity-weights-settings";

export const dynamic = "force-dynamic";

type TierFloor = "high" | "mid" | "low";

async function fetchCurrentSettings() {
  const admin = createAdminClient();
  const [{ data: pressRow }, { data: weightsRow }] = await Promise.all([
    admin
      .from("press_auto_confirm_settings")
      .select("tier_floor, reason, applied_by, effective_from")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("popularity_weights_history")
      .select("view_weight, apply_weight, max_boost, reason, applied_by, effective_from")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { pressRow, weightsRow };
}

// ── server action: press tier override ──────────────────────────
async function overridePressTier(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) throw new Error("Unauthorized");

  const tierFloor = String(formData.get("tier_floor") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!["high", "mid", "low"].includes(tierFloor)) {
    throw new Error("invalid tier_floor");
  }
  if (!reason || reason.length < 5) {
    throw new Error("reason 5자 이상 필요");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("press_auto_confirm_settings").insert({
    tier_floor: tierFloor,
    reason: `[수동 override] ${reason}`,
    applied_by: "manual_override",
  });
  if (error) throw new Error(`insert 실패: ${error.message}`);

  // 리뷰 C2 — cache reset 누락 시 override 즉시 반영 안 됨 (다음 cron/요청까지 stale)
  _resetTierFloorCache();

  // 리뷰 C1 — admin_actions enum + logAdminAction helper 사용 (직접 insert 우회 X)
  await logAdminAction({
    actorId: user.id,
    action: "press_tier_manual_override",
    details: { tier_floor: tierFloor, reason },
  });

  revalidatePath("/admin/self-learning-override");
  revalidatePath("/admin/autonomous");
}

// ── server action: weights override ─────────────────────────────
async function overrideWeights(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) throw new Error("Unauthorized");

  const view = parseFloat(String(formData.get("view_weight") ?? "0"));
  const apply = parseFloat(String(formData.get("apply_weight") ?? "0"));
  const maxBoost = parseFloat(String(formData.get("max_boost") ?? "0"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!Number.isFinite(view) || view < 0 || view > 5) {
    throw new Error("view_weight 0~5 범위 필요");
  }
  if (!Number.isFinite(apply) || apply < 0 || apply > 5) {
    throw new Error("apply_weight 0~5 범위 필요");
  }
  if (!Number.isFinite(maxBoost) || maxBoost < 1 || maxBoost > 10) {
    throw new Error("max_boost 1~10 범위 필요");
  }
  if (!reason || reason.length < 5) {
    throw new Error("reason 5자 이상 필요");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("popularity_weights_history").insert({
    view_weight: view,
    apply_weight: apply,
    max_boost: maxBoost,
    reason: `[수동 override] ${reason}`,
    applied_by: "manual_override",
  });
  if (error) throw new Error(`insert 실패: ${error.message}`);

  // 리뷰 C2 — cache reset 누락 시 override 즉시 반영 안 됨
  _resetWeightsCache();

  // 리뷰 C1 — admin_actions enum + logAdminAction helper 사용
  await logAdminAction({
    actorId: user.id,
    action: "weights_manual_override",
    details: { view_weight: view, apply_weight: apply, max_boost: maxBoost, reason },
  });

  revalidatePath("/admin/self-learning-override");
  revalidatePath("/admin/autonomous");
}

export default async function SelfLearningOverridePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) redirect("/");

  const { pressRow, weightsRow } = await fetchCurrentSettings();
  const tiers: TierFloor[] = ["high", "mid", "low"];

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20 px-5">
      <div className="max-w-[720px] mx-auto">
        <div className="mb-6">
          <a
            href="/admin/autonomous"
            className="text-[13px] text-grey-600 no-underline hover:text-grey-700"
          >
            ← 자율 운영 hub
          </a>
          <h1 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 mt-3 tracking-[-0.5px]">
            🔧 학습 결과 수동 override
          </h1>
          <p className="text-[14px] text-grey-700 mt-2">
            학습 cron 결과 마음에 안 들 때 즉시 강제 변경. applied_by=
            <code className="px-1 bg-grey-100 rounded">manual_override</code>{" "}
            history row insert. 다음 cron 발화 시 데이터 기반 재결정 (override
            영구 아님).
          </p>
        </div>

        {/* Press tier_floor override */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5 mb-5">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3">
            📊 press tier_floor 강제 변경
          </h2>
          <div className="text-[13px] text-grey-700 mb-3">
            현재 active:{" "}
            {pressRow ? (
              <>
                <strong className="text-grey-900">{pressRow.tier_floor}</strong>{" "}
                <span className="text-[11px] text-grey-500">
                  ({pressRow.applied_by} ·{" "}
                  {pressRow.effective_from?.slice(0, 10)})
                </span>
              </>
            ) : (
              <span className="text-grey-500">설정 row 없음</span>
            )}
          </div>
          <form action={overridePressTier} className="space-y-3">
            <div>
              <label className="text-[12px] text-grey-600">
                tier_floor (high/mid/low):
              </label>
              <select
                name="tier_floor"
                className="block w-full mt-1 px-3 py-2 border border-grey-200 rounded text-[14px]"
                defaultValue={pressRow?.tier_floor ?? "mid"}
              >
                {tiers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] text-grey-600">사유 (5자 이상):</label>
              <input
                name="reason"
                type="text"
                className="block w-full mt-1 px-3 py-2 border border-grey-200 rounded text-[14px]"
                placeholder="예: 학습 결과가 너무 보수적이라 1주 동안 high 강제"
                required
                minLength={5}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-[14px] font-semibold rounded hover:bg-blue-700"
            >
              press tier override 적용
            </button>
          </form>
        </section>

        {/* Popularity weights override */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3">
            ⚖️ popularity weights 강제 변경
          </h2>
          <div className="text-[13px] text-grey-700 mb-3">
            현재 active:{" "}
            {weightsRow ? (
              <>
                <span className="text-grey-900">
                  view {weightsRow.view_weight} · apply {weightsRow.apply_weight}{" "}
                  · max_boost {weightsRow.max_boost}
                </span>{" "}
                <span className="text-[11px] text-grey-500">
                  ({weightsRow.applied_by} ·{" "}
                  {weightsRow.effective_from?.slice(0, 10)})
                </span>
              </>
            ) : (
              <span className="text-grey-500">설정 row 없음</span>
            )}
          </div>
          <form action={overrideWeights} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[12px] text-grey-600">
                  view_weight (0~5):
                </label>
                <input
                  name="view_weight"
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  defaultValue={weightsRow?.view_weight ?? 1.0}
                  className="block w-full mt-1 px-3 py-2 border border-grey-200 rounded text-[14px]"
                  required
                />
              </div>
              <div>
                <label className="text-[12px] text-grey-600">
                  apply_weight (0~5):
                </label>
                <input
                  name="apply_weight"
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  defaultValue={weightsRow?.apply_weight ?? 2.0}
                  className="block w-full mt-1 px-3 py-2 border border-grey-200 rounded text-[14px]"
                  required
                />
              </div>
              <div>
                <label className="text-[12px] text-grey-600">
                  max_boost (1~10):
                </label>
                <input
                  name="max_boost"
                  type="number"
                  step="0.01"
                  min="1"
                  max="10"
                  defaultValue={weightsRow?.max_boost ?? 3.0}
                  className="block w-full mt-1 px-3 py-2 border border-grey-200 rounded text-[14px]"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] text-grey-600">사유 (5자 이상):</label>
              <input
                name="reason"
                type="text"
                className="block w-full mt-1 px-3 py-2 border border-grey-200 rounded text-[14px]"
                placeholder="예: apply 가중치 높여서 신청 전환률 강조"
                required
                minLength={5}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-[14px] font-semibold rounded hover:bg-blue-700"
            >
              weights override 적용
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
