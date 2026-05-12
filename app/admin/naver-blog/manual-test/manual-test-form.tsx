"use client";

// ============================================================
// manual-test form (client) — dry-run / 실제 발행 trigger
// ============================================================

import { useState, useTransition } from "react";
import { runManualPublishAction, type ManualTestResult } from "./actions";

export type QueueOption = {
  id: string;
  title: string;
};

export function ManualTestForm({ options }: { options: QueueOption[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualTestResult | null>(null);
  const [queueId, setQueueId] = useState<string>(options[0]?.id ?? "");

  function submit(dryRun: boolean) {
    if (!queueId) {
      setResult({ ok: false, error: "큐 항목 선택 필요", reason: "ui", details: {} });
      return;
    }
    if (!dryRun) {
      // 실제 발행 — 사용자 확인
      const ok = window.confirm(
        "실제로 사장님 네이버 블로그에 글이 발행됩니다. 진행할까요?\n\n(dry-run 으로 먼저 검증하는 것을 권장)",
      );
      if (!ok) return;
    }

    const fd = new FormData();
    fd.set("queue_id", queueId);
    fd.set("dry_run", dryRun ? "1" : "0");
    setResult(null);
    startTransition(async () => {
      const r = await runManualPublishAction(fd);
      setResult(r);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qid" className="block text-sm font-medium mb-1">
          발행할 큐 항목
        </label>
        <select
          id="qid"
          value={queueId}
          onChange={(e) => setQueueId(e.target.value)}
          className="w-full border border-grey-300 rounded px-3 py-2 text-sm"
        >
          {options.length === 0 ? (
            <option value="">— pending 큐 비어 있음 —</option>
          ) : (
            options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.title.slice(0, 60)} ({opt.id.slice(0, 8)})
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={pending || options.length === 0}
          className="px-4 py-2 text-sm font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-grey-400"
        >
          {pending ? "처리 중..." : "🧪 Dry-run 검증 (실제 발행 X)"}
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pending || options.length === 0}
          className="px-4 py-2 text-sm font-semibold rounded bg-orange-600 text-white hover:bg-orange-700 disabled:bg-grey-400"
        >
          {pending ? "처리 중..." : "🚀 실제 발행 1건"}
        </button>
      </div>

      <p className="text-xs text-grey-600">
        ⚠️ Vercel serverless 의 chromium cold start ~6초 + SE3 입력 ~30초 →
        전체 30~60초 소요. 응답이 늦어도 새로고침 X.
      </p>

      {result && <ResultPanel result={result} />}
    </div>
  );
}

function ResultPanel({ result }: { result: ManualTestResult }) {
  if (result.ok) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm space-y-2">
        <p className="font-bold text-green-900">
          ✅ {result.dryRun ? "Dry-run 검증 성공" : "실제 발행 성공"}
        </p>
        {result.naverUrl && (
          <p className="text-green-800">
            네이버 URL:{" "}
            <a
              href={result.naverUrl}
              target="_blank"
              rel="noopener"
              className="underline font-semibold"
            >
              {result.naverUrl}
            </a>
          </p>
        )}
        {result.dryRun && (
          <p className="text-xs text-green-700">
            마지막 발행 click 만 skip 됐고 selector·iframe·cookies 검증 OK.
            이제 「실제 발행」 안전합니다.
          </p>
        )}
        <details>
          <summary className="cursor-pointer text-xs font-medium">디버그 정보</summary>
          <pre className="mt-2 text-xs bg-white p-2 rounded border border-green-200 overflow-auto">
            {JSON.stringify(result.details, null, 2)}
          </pre>
        </details>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm space-y-2">
      <p className="font-bold text-red-900">❌ 실패</p>
      <p className="text-red-800">
        <strong>사유:</strong> {result.reason}
      </p>
      <p className="text-red-800 break-all">
        <strong>메시지:</strong> {result.error}
      </p>
      {result.reason === "captcha_detected" && (
        <p className="text-xs text-red-700">
          네이버가 캡차를 띄웠어요. 사장님 Chrome 에서 naver.com 로그인 → 캡차 통과 →{" "}
          /admin/naver-blog/cookies 에서 cookies 재발급 후 다시 시도.
        </p>
      )}
      {result.reason === "2fa_detected" && (
        <p className="text-xs text-red-700">
          네이버가 2단계 인증을 요청. 사장님 Chrome 에서 통과 후 cookies 재발급.
        </p>
      )}
      {result.reason === "session_invalid" && (
        <p className="text-xs text-red-700">
          cookies 만료. /admin/naver-blog/cookies 에서 새로 export·업로드.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-medium">디버그 정보</summary>
        <pre className="mt-2 text-xs bg-white p-2 rounded border border-red-200 overflow-auto">
          {JSON.stringify(result.details, null, 2)}
        </pre>
      </details>
    </div>
  );
}
