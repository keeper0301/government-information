"use client";

// ============================================================
// PressClassifyAction — AI 분류 trigger + 결과 prefill 이동 (Step 2 client)
// ============================================================
// /admin/press-ingest 의 각 row 옆에 노출.
//   1. '🤖 AI 분류' 버튼 클릭 → POST /api/admin/classify-press
//   2. 로딩 → 결과 모달 (is_policy / program_type / 자격 등)
//   3. 사장님이 '복지 등록 폼' 또는 '대출 등록 폼' 클릭 → prefill URL 로 navigation
//
// 자동 INSERT X — 사장님이 검토 후 등록 폼에서 confirm.
// ANTHROPIC_API_KEY 미설정 시 503 → 사용자에게 안내.
// ============================================================

import { useState } from "react";
import type { ClassifyResult } from "@/lib/press-ingest/classify";

type Props = {
  newsId: string;
  // press-ingest 페이지가 만든 fallback prefill URL (LLM 미사용, summary 만)
  fallbackWelfareUrl: string;
  fallbackLoanUrl: string;
};

// LLM 결과 → prefill URL — title/source 외 추가 필드 포함
// URL 너무 길어지면 잘릴 수 있어 각 필드 cap.
function buildLlmPrefillUrl(
  base: string,
  result: ClassifyResult,
  baseQuery: URLSearchParams,
): string {
  const qs = new URLSearchParams(baseQuery);
  // LLM 결과로 덮어쓰기 (보도자료 prefill 보다 정확)
  qs.set("title", result.title.slice(0, 500));
  if (result.target) qs.set("target", result.target.slice(0, 1000));
  if (result.eligibility)
    qs.set("eligibility", result.eligibility.slice(0, 2000));
  if (result.benefits) qs.set("benefits", result.benefits.slice(0, 1000));
  if (result.apply_method)
    qs.set("apply_method", result.apply_method.slice(0, 1000));
  if (result.apply_url) qs.set("apply_url", result.apply_url.slice(0, 500));
  if (result.apply_start) qs.set("apply_start", result.apply_start);
  if (result.apply_end) qs.set("apply_end", result.apply_end);
  if (result.category) qs.set("category", result.category.slice(0, 50));
  // loan 만
  if (result.loan_amount) qs.set("loan_amount", result.loan_amount.slice(0, 200));
  if (result.interest_rate)
    qs.set("interest_rate", result.interest_rate.slice(0, 200));
  if (result.repayment_period)
    qs.set("repayment_period", result.repayment_period.slice(0, 200));
  return `${base}?${qs.toString()}`;
}

export function PressClassifyAction({
  newsId,
  fallbackWelfareUrl,
  fallbackLoanUrl,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function classify() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/classify-press", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ news_id: newsId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // baseQuery 는 fallback URL 에서 추출 — source/source_url/description/region 보존
  function extractBaseQuery(url: string): URLSearchParams {
    const q = url.split("?")[1] ?? "";
    return new URLSearchParams(q);
  }

  return (
    <div className="flex flex-col gap-1">
      {!result && !loading && !error && (
        <button
          type="button"
          onClick={classify}
          className="text-xs text-purple-600 hover:text-purple-800 font-semibold whitespace-nowrap text-left"
        >
          🤖 AI 분류
        </button>
      )}
      {loading && (
        <span className="text-xs text-grey-600 whitespace-nowrap">
          분류 중…
        </span>
      )}
      {error && (
        <div className="text-xs text-red leading-[1.3] max-w-[140px] break-words">
          {error.includes("ANTHROPIC_API_KEY")
            ? "API 키 미설정"
            : error.slice(0, 60)}
          <button
            type="button"
            onClick={() => {
              setError(null);
              classify();
            }}
            className="block mt-1 text-purple-600 underline"
          >
            재시도
          </button>
        </div>
      )}
      {result && (
        <div className="text-xs leading-[1.4] max-w-[180px]">
          <div className="font-semibold mb-1">
            {result.is_policy ? "✓ 정책" : "✗ 비정책"} ·{" "}
            <span className="uppercase">{result.program_type}</span>
          </div>
          {result.is_policy ? (
            <>
              {result.program_type !== "loan" && (
                <a
                  href={buildLlmPrefillUrl(
                    "/admin/welfare/new",
                    result,
                    extractBaseQuery(fallbackWelfareUrl),
                  )}
                  className="block text-blue-500 hover:text-blue-700 font-semibold no-underline mb-0.5"
                >
                  복지 등록 →
                </a>
              )}
              {result.program_type !== "welfare" && (
                <a
                  href={buildLlmPrefillUrl(
                    "/admin/loan/new",
                    result,
                    extractBaseQuery(fallbackLoanUrl),
                  )}
                  className="block text-orange-500 hover:text-orange-700 font-semibold no-underline"
                >
                  대출 등록 →
                </a>
              )}
            </>
          ) : (
            <span className="text-grey-500">등록 X</span>
          )}
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-1 text-grey-500 underline text-xs"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
