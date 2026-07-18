"use client";

// ============================================================
// AlimtalkTestForm — /admin/alimtalk 의 테스트 발송 폼
// ============================================================
// 본인 휴대폰 번호 + 템플릿 선택 + 변수 override 입력 → /api/admin/alimtalk-test 호출
// → Solapi 응답 그대로 표시.
// ============================================================

import { useState } from "react";

type ApiResult =
  | { ok: true; messageId: string; provider: string }
  | { ok: false; reason: string; error?: string; retryAfterSec?: number };

type TemplateCode = "POLICY_NEW" | "POLICY_NEW_V3" | "POLICY_NEW_V4";

// 한국 휴대폰 번호 클라이언트 검증 (서버도 다시 검증하니 여기선 UX 힌트용).
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;

export function AlimtalkTestForm() {
  const [phone, setPhone] = useState("");
  const [templateCode, setTemplateCode] = useState<TemplateCode>("POLICY_NEW_V4");
  const [userName, setUserName] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [title, setTitle] = useState("");
  const [announcedAt, setAnnouncedAt] = useState("");
  const [eligibilityStatus, setEligibilityStatus] = useState("");
  const [benefitSummary, setBenefitSummary] = useState("");
  const [deadline, setDeadline] = useState("");
  const [detailPath, setDetailPath] = useState("");
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
      if (userName.trim()) variables.user_name = userName.trim();
      if (ruleName.trim()) variables.rule_name = ruleName.trim();
      if (title.trim()) variables.title = title.trim();
      if (announcedAt.trim()) variables.announced_at = announcedAt.trim();
      if (eligibilityStatus.trim()) variables.eligibility_status = eligibilityStatus.trim();
      if (benefitSummary.trim()) variables.benefit_summary = benefitSummary.trim();
      if (deadline.trim()) variables.deadline = deadline.trim();
      if (detailPath.trim()) variables.detail_path = detailPath.trim();

      const res = await fetch("/api/admin/alimtalk-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phone,
          templateCode,
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

  const isRichTemplate = templateCode !== "POLICY_NEW";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field
        label="수신자 휴대폰 번호 *"
        value={phone}
        onChange={setPhone}
        placeholder="010-1234-5678"
        required
      />

      <label className="block">
        <span className="block text-xs font-semibold text-grey-700 mb-1">
          테스트 템플릿
        </span>
        <select
          value={templateCode}
          onChange={(e) => setTemplateCode(e.target.value as TemplateCode)}
          className="w-full px-3 py-2 border border-grey-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none bg-white"
        >
          <option value="POLICY_NEW_V4">POLICY_NEW_V4 — 운영자 문의 명시 추천안</option>
          <option value="POLICY_NEW_V3">POLICY_NEW_V3 — 자격진단 포함</option>
          <option value="POLICY_NEW">POLICY_NEW — 기본형 fallback</option>
        </select>
      </label>

      <details className="rounded-lg border border-grey-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-grey-700">
          템플릿 변수 override (선택)
        </summary>
        <div className="mt-3 space-y-2">
          {isRichTemplate && (
            <Field
              label="user_name (기본값: 관철)"
              value={userName}
              onChange={setUserName}
              placeholder="관철"
            />
          )}
          <Field
            label="rule_name (기본값: [테스트] 내 맞춤 알림)"
            value={ruleName}
            onChange={setRuleName}
            placeholder="[테스트] 내 맞춤 알림"
          />
          <Field
            label={isRichTemplate ? "title (기본값: [테스트] 소상공인 정책자금 2026)" : "title (기본값: [테스트] 청년 주거 지원 정책 2026)"}
            value={title}
            onChange={setTitle}
            placeholder={isRichTemplate ? "[테스트] 소상공인 정책자금 2026" : "[테스트] 청년 주거 지원 정책 2026"}
          />
          {isRichTemplate && (
            <>
              <Field
                label="announced_at (기본값: 7월 18일)"
                value={announcedAt}
                onChange={setAnnouncedAt}
                placeholder="7월 18일"
              />
              <Field
                label="eligibility_status (기본값: ✓ 자격 충족 (테스트))"
                value={eligibilityStatus}
                onChange={setEligibilityStatus}
                placeholder="✓ 자격 충족 (테스트)"
              />
              <Field
                label="benefit_summary (기본값: 최대 500만원)"
                value={benefitSummary}
                onChange={setBenefitSummary}
                placeholder="최대 500만원"
              />
            </>
          )}
          <Field
            label="deadline (기본값: 2026-12-31)"
            value={deadline}
            onChange={setDeadline}
            placeholder="2026-12-31"
          />
          <Field
            label="detail_path (기본값: /mypage/notifications — 선행 / 포함한 경로만)"
            value={detailPath}
            onChange={setDetailPath}
            placeholder="/welfare/abc123"
          />
        </div>
      </details>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-blue-500 text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "발송 중…" : "테스트 발송"}
      </button>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red"
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
      <span className="block text-xs font-semibold text-grey-700 mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
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
        className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
      >
        <p className="font-semibold mb-1">✅ 발송 성공</p>
        <p>provider: <code>{result.provider}</code></p>
        {result.messageId && (
          <p>messageId: <code className="break-all">{result.messageId}</code></p>
        )}
        <p className="mt-2 text-xs text-blue-700">
          몇 초 이내로 카카오톡 알림톡이 도착합니다. 미도착 시 카카오톡 설정의
          ‘메시지 수신 차단’ 여부를 먼저 확인해 주세요.
        </p>
      </div>
    );
  }

  const reasonExplain: Record<string, string> = {
    skipped_no_provider:
      "KAKAO_ALIMTALK_PROVIDER 환경변수가 비어 있어 발송 경로가 비활성 상태입니다.",
    skipped_quiet_hours:
      "KST 21:00~08:00 야간 시간대라 발송을 막았습니다. 주간 시간대에 다시 테스트하세요.",
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
      className="rounded-lg border border-red/30 bg-red/5 p-4 text-sm text-red"
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
        <p className="mt-2 text-xs leading-[1.6]">
          {reasonExplain[result.reason]}
        </p>
      )}
    </div>
  );
}
