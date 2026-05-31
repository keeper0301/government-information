// ============================================================
// autonomous hub — 자가 진화 학습 카드 (Spec 1 + Spec 2)
// ============================================================
// /admin/autonomous 에 노출. 매주 월 새벽 학습 cron 결과 + 현재 active 설정.
//   - Spec 1: press_ingest tier_floor (매주 월 02:00 KST)
//   - Spec 2: popularity weights (매주 월 02:30 KST)
// ============================================================

import type {
  SelfLearningSnapshot,
  SelfLearningPressTier,
  SelfLearningPopularityWeights,
  PressTierHistoryEntry,
  PopularityWeightsHistoryEntry,
  PressTierAppliedBy,
} from "@/lib/self-learning/snapshot";

const APPLIED_BY_LABEL: Record<PressTierAppliedBy, string> = {
  cron_learn: "자가 학습",
  manual_override: "사장님 수동",
  initial_seed: "초기 seed",
};

const APPLIED_BY_TONE: Record<PressTierAppliedBy, string> = {
  cron_learn: "bg-emerald-100 text-emerald-800",
  manual_override: "bg-blue-100 text-blue-800",
  initial_seed: "bg-slate-200 text-slate-700",
};

function formatKstDate(iso: string): string {
  // ISO timestamp 를 'YYYY-MM-DD' (KST) 로
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

// timeline 표시용 — '05/27' 단축 (year 생략)
function formatKstShort(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return `${String(kst.getUTCMonth() + 1).padStart(2, "0")}/${String(kst.getUTCDate()).padStart(2, "0")}`;
}

// applied_by → 이모지 (timeline 가독성)
const APPLIED_BY_ICON: Record<PressTierAppliedBy, string> = {
  initial_seed: "🌱",
  cron_learn: "🤖",
  manual_override: "👤",
};

// 한국어 단어 경계 trim — 인스타 카드 readability 학습 패턴 적용 (5/16).
// slice(0, max-1) 후 공백/·/,/. 마지막 위치 찾아 단어 중간 잘림 방지.
// 마지막 break 가 max 의 60% 이전이면 자연 단위 못 찾은 것 — 어쩔 수 없이 max cut.
function truncateReason(reason: string, max = 50): string {
  if (reason.length <= max) return reason;
  const slice = reason.slice(0, max - 1);
  const breakChars = [" ", "·", ",", ".", "—", "→", "/"];
  const lastBreak = Math.max(
    ...breakChars.map((c) => slice.lastIndexOf(c)),
  );
  const minBreakAt = Math.floor(max * 0.6);
  const cutAt = lastBreak > minBreakAt ? lastBreak : max - 1;
  return slice.slice(0, cutAt).trimEnd() + "…";
}

function Tag({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function PressTierBlock({ data }: { data: SelfLearningPressTier }) {
  return (
    <div className="border-l-4 border-blue-400 pl-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">
          Spec 1 · press_ingest tier_floor
        </span>
        <Tag tone={APPLIED_BY_TONE[data.appliedBy]} label={APPLIED_BY_LABEL[data.appliedBy]} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-600">현재</div>
          <div className="font-semibold text-slate-900">{data.current}</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-600">7d mid 회수율</div>
          <div className="font-semibold text-slate-900">
            {data.midRevokeRate7d !== null ? `${data.midRevokeRate7d}%` : "—"}
          </div>
          {data.midDecidedCount !== null && (
            <div className="text-[10px] text-slate-500">{data.midDecidedCount}건 기준</div>
          )}
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-600">7d low confirm</div>
          <div className="font-semibold text-slate-900">
            {data.lowConfirmRate7d !== null ? `${data.lowConfirmRate7d}%` : "—"}
          </div>
          {data.lowDecidedCount !== null && (
            <div className="text-[10px] text-slate-500">{data.lowDecidedCount}건 기준</div>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
        <span className="font-medium">마지막 결정:</span> {data.reason}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        {formatKstDate(data.effectiveFrom)} 적용 · 다음 cron {data.nextCronKst} KST
      </p>
    </div>
  );
}

function PopularityWeightsBlock({ data }: { data: SelfLearningPopularityWeights }) {
  return (
    <div className="border-l-4 border-emerald-400 pl-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">
          Spec 2 · popularity weights
        </span>
        <Tag tone={APPLIED_BY_TONE[data.appliedBy]} label={APPLIED_BY_LABEL[data.appliedBy]} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-600">view weight</div>
          <div className="font-semibold text-slate-900">{data.viewWeight}</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-600">apply weight</div>
          <div className="font-semibold text-slate-900">{data.applyWeight}</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-600">max boost</div>
          <div className="font-semibold text-slate-900">{data.maxBoost}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
        <div>
          <span className="text-slate-500">30d 전환율:</span>{" "}
          {data.conversionRate30d !== null ? `${data.conversionRate30d}%` : "—"}
        </div>
        <div>
          <span className="text-slate-500">사용자/events:</span>{" "}
          {data.uniqueUsers30d !== null ? data.uniqueUsers30d : "—"} /{" "}
          {data.totalEvents30d !== null ? data.totalEvents30d.toLocaleString("ko-KR") : "—"}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
        <span className="font-medium">마지막 결정:</span> {data.reason}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        {formatKstDate(data.effectiveFrom)} 적용 · 다음 cron {data.nextCronKst} KST
      </p>
    </div>
  );
}

function HistoryTimeline({
  pressHistory,
  popularityHistory,
}: {
  pressHistory: PressTierHistoryEntry[];
  popularityHistory: PopularityWeightsHistoryEntry[];
}) {
  // 두 history 모두 latest 1개 이하면 timeline 가치 ↓ (변화 없음)
  if (pressHistory.length <= 1 && popularityHistory.length <= 1) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="mb-2 text-xs font-semibold text-slate-700">
        📜 최근 학습 history (최대 7주)
      </h3>
      <div className="space-y-3">
        {pressHistory.length > 1 && (
          <div>
            <div className="mb-1 text-[11px] font-medium text-blue-700">
              Spec 1 · tier_floor
            </div>
            <ol className="space-y-1">
              {pressHistory.map((row, idx) => (
                <li
                  key={`tier-${idx}-${row.effectiveFrom}`}
                  className="flex items-start gap-1.5 text-[11px] text-slate-700"
                >
                  <span className="shrink-0 w-4">{APPLIED_BY_ICON[row.appliedBy]}</span>
                  <span className="shrink-0 w-9 text-slate-500">
                    {formatKstShort(row.effectiveFrom)}
                  </span>
                  <span className="shrink-0 w-10 font-semibold text-slate-900">
                    {row.tierFloor}
                  </span>
                  <span className="text-slate-600 leading-snug">
                    {truncateReason(row.reason)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {popularityHistory.length > 1 && (
          <div>
            <div className="mb-1 text-[11px] font-medium text-emerald-700">
              Spec 2 · weights (apply_weight)
            </div>
            <ol className="space-y-1">
              {popularityHistory.map((row, idx) => (
                <li
                  key={`weights-${idx}-${row.effectiveFrom}`}
                  className="flex items-start gap-1.5 text-[11px] text-slate-700"
                >
                  <span className="shrink-0 w-4">{APPLIED_BY_ICON[row.appliedBy]}</span>
                  <span className="shrink-0 w-9 text-slate-500">
                    {formatKstShort(row.effectiveFrom)}
                  </span>
                  <span className="shrink-0 w-10 font-semibold text-slate-900">
                    {row.applyWeight}
                  </span>
                  <span className="text-slate-600 leading-snug">
                    {truncateReason(row.reason)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

export function SelfLearningCard({ snapshot }: { snapshot: SelfLearningSnapshot }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            🤖 자가 진화 학습 (Spec 1+2)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            매주 월 새벽 데이터 기반 자동 튜닝. cron 미가동·데이터 부족 시 no-op.
          </p>
        </div>
        {/* 2026-05-31 P3 #2/#4 — 사장님 매주 월 자동 발화 안 기다리고 즉시 검증
            가속용 link. cron-trigger page 에 학습 cron 3종 등록되어 있음.
            audit link 는 7주 누적 발화 이력 표 (P3 #4). */}
        <div className="shrink-0 flex flex-col gap-1.5">
          <a
            href="/admin/cron-trigger"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-center"
            title="press-confidence-tune / popularity-weights-tune / self-learning-digest 수동 실행"
          >
            ▶ 수동 실행 ↗
          </a>
          <a
            href="/admin/self-learning-audit"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-center"
            title="7주 누적 발화 이력 + 액션별 카운트"
          >
            📜 7주 audit ↗
          </a>
        </div>
      </header>

      <div className="space-y-4">
        {snapshot.pressTier ? (
          <PressTierBlock data={snapshot.pressTier} />
        ) : (
          <div className="border-l-4 border-slate-200 pl-3 text-xs text-slate-500">
            Spec 1 — press_ingest tier_floor: 학습 row 없음
          </div>
        )}

        {snapshot.popularityWeights ? (
          <PopularityWeightsBlock data={snapshot.popularityWeights} />
        ) : (
          <div className="border-l-4 border-slate-200 pl-3 text-xs text-slate-500">
            Spec 2 — popularity weights: 학습 row 없음
          </div>
        )}
      </div>

      <HistoryTimeline
        pressHistory={snapshot.pressTierHistory}
        popularityHistory={snapshot.popularityWeightsHistory}
      />
    </section>
  );
}
