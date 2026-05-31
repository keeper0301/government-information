// ============================================================
// autonomous hub — PUSH_TRACK_HMAC_SECRET 회전 추적 카드 (2026-05-31 P3 #11)
// ============================================================
// PWA 푸시 알림 click track HMAC 키 회전 주기 점검. env
// PUSH_TRACK_HMAC_ROTATED_AT (ISO 날짜) 기준 6개월 amber / 1년 red.
//
// CronSecretRotationCard 와 같은 패턴 — 3+ secret 카드 누적 시 helper 추출 spec.
// 데이터 fetch 0 — env 만 읽음. server component.
// ============================================================

const ROTATION_WARN_DAYS = 180; // 6개월
const ROTATION_DANGER_DAYS = 365; // 1년

function daysSince(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function PushTrackSecretRotationCard() {
  const rotatedAt = process.env.PUSH_TRACK_HMAC_ROTATED_AT?.trim() || null;
  const days = rotatedAt ? daysSince(rotatedAt) : null;
  const isDanger = days !== null && days >= ROTATION_DANGER_DAYS;
  const isWarn = days !== null && days >= ROTATION_WARN_DAYS && !isDanger;
  const isUnset = !rotatedAt;
  const isInvalid = rotatedAt && days === null;

  const borderClass = isDanger
    ? "border-red-300 bg-red-50"
    : isWarn
      ? "border-amber-300 bg-amber-50"
      : "border-slate-200 bg-white";

  return (
    <section className={`rounded-xl border p-5 ${borderClass}`}>
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">
          🔑 PUSH_TRACK_HMAC_SECRET 회전 추적
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          PWA 푸시 click track HMAC 키 회전 주기 점검 · 6개월 amber / 1년 red
          · 회전 시 in-flight 알림 click track 영향 가시화 필요
        </p>
      </header>

      {isUnset && (
        <div className="text-sm text-slate-700">
          <p>회전 시점 미기록</p>
          <p className="mt-2 text-xs text-slate-500">
            Vercel env 에{" "}
            <code className="px-1 bg-slate-100 rounded">
              PUSH_TRACK_HMAC_ROTATED_AT
            </code>{" "}
            를 ISO 날짜로 등록하면 자동 추적 시작.
            <br />
            예: <code className="px-1 bg-slate-100 rounded">2026-05-31</code>
          </p>
        </div>
      )}

      {isInvalid && (
        <div className="text-sm text-red-700">
          ⚠️ env <code>PUSH_TRACK_HMAC_ROTATED_AT</code> 값이 ISO 날짜 형식이 아닙니다
          (현재: <code>{rotatedAt}</code>)
        </div>
      )}

      {!isUnset && !isInvalid && days !== null && (
        <div className="text-sm">
          <p className="text-slate-700">
            마지막 회전:{" "}
            <strong className="text-slate-900">{rotatedAt}</strong> ({days}일
            경과)
          </p>
          {isDanger && (
            <p className="mt-2 text-red-700 font-semibold">
              ⚠️ 1년 경과 — 즉시 회전 권장. 회전 시 in-flight 알림 click track URL
              은 새 HMAC 으로 재서명 못 함 (단순 회전 시 기존 push payload 영향 ↓).
            </p>
          )}
          {isWarn && (
            <p className="mt-2 text-amber-800">
              ⏰ 6개월 경과 — 회전 권장 (1년 도달까지{" "}
              {ROTATION_DANGER_DAYS - days}일 남음)
            </p>
          )}
          {!isWarn && !isDanger && (
            <p className="mt-2 text-emerald-700 text-xs">
              ✅ 회전 주기 정상 (6개월 도달까지 {ROTATION_WARN_DAYS - days}일
              남음)
            </p>
          )}
        </div>
      )}
    </section>
  );
}
