// app/admin/news/backfill-dedupe-runner/page.tsx
// 마이그레이션 065 후 13,141 row 의 dedupe_hash 백필을 사장님이 1번 클릭으로
// 자동 반복 호출하는 admin 페이지 (Phase 5 후속).
//
// 동작:
//   1) "시작" 클릭 → /admin/news/backfill-dedupe?limit=200 호출
//   2) 응답 받으면 updated/remaining 화면 갱신
//   3) remaining > 0 면 1초 대기 후 다음 호출 (DB 부하 회피)
//   4) remaining 0 → 자동 정지 + 완료 메시지
//   5) "중단" 버튼 — 사용자 의도 정지
//
// 사장님 권한 가드는 backfill-dedupe endpoint 가 처리 (admin 가드 + 가드 통과 시 처리).

"use client";

import { useEffect, useRef, useState } from "react";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

const BATCH_LIMIT = 200;
const DELAY_MS = 1000; // 호출 사이 대기 — DB 부하 회피

type RunnerState = "idle" | "running" | "done" | "stopped" | "error";

type BackfillResponse = {
  updated?: number;
  failed?: number;
  remaining?: number;
  message?: string;
  error?: string;
};

export default function BackfillRunnerPage() {
  const [state, setState] = useState<RunnerState>("idle");
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [calls, setCalls] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // 정지 신호 (state 갱신 비동기라 ref 로 즉시 반영)
  const stopRef = useRef(false);

  // 진행률 % (remaining + totalUpdated 합으로 추산)
  const totalEstimated = remaining !== null ? remaining + totalUpdated : null;
  const progressPct =
    totalEstimated && totalEstimated > 0
      ? Math.round((totalUpdated / totalEstimated) * 100)
      : 0;

  // ETA — 평균 회당 시간 × 남은 호출 수
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const avgPerCallMs = calls > 0 ? elapsedMs / calls : 0;
  const remainingCalls =
    remaining !== null ? Math.ceil(remaining / BATCH_LIMIT) : 0;
  const etaSec = Math.round((avgPerCallMs * remainingCalls) / 1000);

  async function start() {
    setState("running");
    stopRef.current = false;
    setTotalUpdated(0);
    setTotalFailed(0);
    setRemaining(null);
    setCalls(0);
    setErrorMsg(null);
    setStartedAt(Date.now());

    while (!stopRef.current) {
      let res: Response;
      try {
        res = await fetch(
          `/admin/news/backfill-dedupe?limit=${BATCH_LIMIT}`,
          { cache: "no-store" },
        );
      } catch (err) {
        setErrorMsg(`네트워크 에러: ${err instanceof Error ? err.message : String(err)}`);
        setState("error");
        return;
      }

      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status}`);
        setState("error");
        return;
      }

      const data: BackfillResponse = await res.json();
      if (data.error) {
        setErrorMsg(data.error);
        setState("error");
        return;
      }

      setTotalUpdated((p) => p + (data.updated ?? 0));
      setTotalFailed((p) => p + (data.failed ?? 0));
      setRemaining(data.remaining ?? 0);
      setCalls((p) => p + 1);

      // 완료 — remaining 0 또는 첫 호출에서 0 row 도착
      if ((data.remaining ?? 0) === 0) {
        setState("done");
        return;
      }

      // 다음 호출 전 대기 (DB 부하 회피)
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    // while 빠져나옴 — stopRef true (사용자 정지)
    setState("stopped");
  }

  function stop() {
    stopRef.current = true;
  }

  // mount 시 현재 NULL row 수 한 번 조회 (실제 진행률 추정 베이스)
  useEffect(() => {
    let aborted = false;
    fetch(`/admin/news/backfill-dedupe?limit=0`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: BackfillResponse) => {
        if (!aborted) setRemaining(data.remaining ?? null);
      })
      .catch(() => {
        /* 권한·네트워크 에러 — 시작 시 다시 보임 */
      });
    return () => {
      aborted = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[640px] mx-auto px-5">
        {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
        <AdminPageHeader
          kicker="ADMIN · 컨텐츠 발행"
          title="news_posts dedupe_hash 백필"
          description={`마이그레이션 065 후 기존 row 의 dedupe_hash 가 NULL. 1번 클릭으로 자동 반복 호출 (회당 ${BATCH_LIMIT} row, 1초 대기) 해서 끝까지 채워요. remaining 0 되면 자동 정지.`}
        />

        {/* 시작·중단 버튼 */}
        <div className="flex items-center gap-3 mb-8">
          {state !== "running" ? (
            <button
              type="button"
              onClick={start}
              className="px-6 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 cursor-pointer border-none"
            >
              {state === "done" ? "다시 시작" : "백필 시작"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="px-6 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 cursor-pointer border-none"
            >
              중단
            </button>
          )}
          <span className="text-sm text-grey-600">
            상태:{" "}
            <b
              className={`${
                state === "running"
                  ? "text-blue-600"
                  : state === "done"
                    ? "text-green-600"
                    : state === "error"
                      ? "text-red-500"
                      : "text-grey-700"
              }`}
            >
              {state === "idle"
                ? "대기"
                : state === "running"
                  ? "진행 중..."
                  : state === "done"
                    ? "완료"
                    : state === "stopped"
                      ? "사용자 중단"
                      : "에러"}
            </b>
          </span>
        </div>

        {/* 진행률 카드 */}
        <section className="bg-white rounded-2xl border border-grey-200 p-5 mb-5">
          <h2 className="text-base font-bold text-grey-900 mb-4">진행 상황</h2>

          {/* progress bar */}
          {totalEstimated && totalEstimated > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-grey-700 mb-1">
                <span>전체 진행률</span>
                <span className="tabular-nums font-semibold">{progressPct}%</span>
              </div>
              <div className="h-2 bg-grey-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-grey-500 text-xs">백필 완료 (누적)</dt>
              <dd className="text-grey-900 font-bold tabular-nums">
                {totalUpdated.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-grey-500 text-xs">남은 NULL</dt>
              <dd className="text-grey-900 font-bold tabular-nums">
                {remaining !== null ? remaining.toLocaleString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-grey-500 text-xs">호출 횟수</dt>
              <dd className="text-grey-900 font-bold tabular-nums">{calls}</dd>
            </div>
            <div>
              <dt className="text-grey-500 text-xs">실패 누적</dt>
              <dd
                className={`font-bold tabular-nums ${
                  totalFailed > 0 ? "text-red-500" : "text-grey-900"
                }`}
              >
                {totalFailed}
              </dd>
            </div>
            {state === "running" && etaSec > 0 && (
              <div className="col-span-2">
                <dt className="text-grey-500 text-xs">예상 남은 시간</dt>
                <dd className="text-grey-900 font-bold tabular-nums">
                  {etaSec >= 60
                    ? `${Math.floor(etaSec / 60)}분 ${etaSec % 60}초`
                    : `${etaSec}초`}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* 에러 표시 */}
        {errorMsg && (
          <section className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 leading-[1.55]">
            <b>에러 발생</b>: {errorMsg}
          </section>
        )}

        {state === "done" && (
          <section className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 leading-[1.55]">
            ✅ 백필 완료. /news 접속 시 dedupe view 가 정상 작동.
          </section>
        )}

        <p className="mt-10 text-xs text-grey-500 leading-[1.5]">
          이 페이지는 backfill-dedupe API 를 자동 반복 호출합니다. 브라우저 탭을
          닫으면 중단되니, 완료까지 (~1~5분) 탭을 열어두세요.
        </p>
      </div>
    </main>
  );
}
