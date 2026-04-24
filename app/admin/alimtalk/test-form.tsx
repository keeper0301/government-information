"use client";

// ============================================================
// AlimtalkTestForm — /admin/alimtalk 의 테스트 발송 폼
// ============================================================
// 본인 휴대폰 번호 + (선택) 변수 override 입력 → /api/admin/alimtalk-test 호출 →
// Solapi 응답 그대로 표시.
// ============================================================

import { useState } from "react";

type ApiResult =
  | { ok: true; messageId: string; provider: string }
  | { ok: false; reason: string; error?: string; retryAfterSec?: number };

// 한국 휴대폰 번호 클라이언트 검증 (서버도 다시 검증하니 여기선 UX 힌트용).
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;

export function AlimtalkTestForm() {
  const [phone, setPhone] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [detailUrl, setDetailUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!phone.match(PHONE_RE)) {
      setError("올바른 휴대폰 번호 형식으로 입력해 주세요. (예: 010-1234-5678)");
      return;
    }

    setLoading(true);
    try {
      // 빈 값은 override 하지 않음 → 서버 기본값 사용
      const variables: Record<string, string> = {};
      if (ruleName.trim()) variables.rule_name = ruleName.trim();
      if (title.trim()) variables.title = title.trim();
      if (deadline.trim()) variables.deadline = deadline.trim();
      if (detailUrl.trim()) variables.detail_url = detailUrl.trim();

      const res = await fetch("/api/admin/alimtalk-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phone,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "요청 실패");
      } else {
        setResult(json.result as ApiResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field
        label="수신자 휴대폰 번호 *"
        value={phone}
        onChange={setPhone}
        placeholder="010-1234-5678"
        required
      />

      <details className="rounded-lg border border-grey-200 bg-white p-3">
        <summary className="cursor-pointer text-[13px] font-semibold text-grey-700">
          템플릿 변수 override (선택)
        </summary>
        <div className="mt-3 space-y-2">
          <Field
            label="rule_name (기본값: [테스트] 내 맞춤 알림)"
            value={ruleName}
            onChange={setRuleName}
            placeholder="[테스트] 내 맞춤 알림"
          />
          <Field
            label="title (기본값: [테스트] 청년 주거 지원 정책 2026)"
            value={title}
            onChange={setTitle}
            placeholder="[테스트] 청년 주거 지원 정책 2026"
          />
          <Field
            label="deadline (기본값: 2026-12-31)"
            value={deadline}
            onChange={setDeadline}
            placeholder="2026-12-31"
          />
          <Field
            label="detail_url (기본값: https://www.keepioo.com/mypage/notifications)"
            value={detailUrl}
            onChange={setDetailUrl}
            placeholder="https://www.keepioo.com/..."
          />
        </div>
      </details>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-bold hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "발송 중…" : "테스트 발송"}
      </button>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red/30 bg-red/5 p-3 text-[13px] text-red"
        >
          {error}
        </div>
      )}

      {result && <ResultPanel result={result} />}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-grey-700 mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[14px] focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}

// 발송 결과 패널 — 성공/실패 사유별로 색상·설명 분기
function ResultPanel({ result }: { result: ApiResult }) {
  if (result.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-[13px] text-blue-900"
      >
        <p className="font-semibold mb-1">✅ 발송 성공</p>
        <p>provider: <code>{result.provider}</code></p>
        {result.messageId && (
          <p>messageId: <code className="break-all">{result.messageId}</code></p>
        )}
        <p className="mt-2 text-[12px] text-blue-700">
          몇 초 이내로 카카오톡 알림톡이 도착합니다. 미도착 시 카카오톡 설정의
          ‘메시지 수신 차단’ 여부를 먼저 확인해 주세요.
        </p>
      </div>
    );
  }

  const reasonExplain: Record<string, string> = {
    skipped_no_provider:
      "KAKAO_ALIMTALK_PROVIDER 환경변수가 비어 있어 발송 경로가 비활성 상태입니다.",
    invalid_phone: "휴대폰 번호 형식이 유효하지 않습니다.",
    rate_limited: "Solapi 호출 한도 초과. 잠시 후 재시도하세요.",
    blocked_by_user:
      "해당 번호가 알림톡 수신 차단 상태이거나 카카오톡 미사용자입니다.",
    template_rejected:
      "템플릿 미승인/변수 불일치. 카카오비즈 센터 심사 상태와 변수 키를 확인하세요.",
    api_error: "Solapi API 오류 또는 환경변수 누락. 상세 메시지를 확인하세요.",
  };

  return (
    <div
      role="alert"
      className="rounded-lg border border-red/30 bg-red/5 p-4 text-[13px] text-red"
    >
      <p className="font-semibold mb-1">❌ 발송 실패</p>
      <p>
        reason: <code>{result.reason}</code>
      </p>
      {result.error && (
        <p className="mt-1 break-all">
          detail: <code>{result.error}</code>
        </p>
      )}
      {reasonExplain[result.reason] && (
        <p className="mt-2 text-[12px] leading-[1.6]">
          {reasonExplain[result.reason]}
        </p>
      )}
    </div>
  );
}
