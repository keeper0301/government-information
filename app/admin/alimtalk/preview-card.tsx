"use client";

// ============================================================
// 카카오 알림톡 카드 미리보기 — POLICY_NEW v2 + POLICY_NEW_V3
// ============================================================
// 사장님이 카카오 v2 (또는 V3) 심사 통과 후 사용자가 실제 어떤 카드를
// 받게 될지 사전 시각 확인. 변수 입력 → 카톡 본문 + 버튼 즉시 렌더.
//
// 발송 안 함 — 순수 클라이언트 시각화. 디자인 검토·심사 반려 대비.
// ============================================================

import { useState } from "react";

type TemplateKey = "POLICY_NEW" | "POLICY_NEW_V3";

// 템플릿별 기본 샘플 값 (사장님이 바로 확인 가능하도록 채워둠)
const DEFAULTS: Record<TemplateKey, Record<string, string>> = {
  POLICY_NEW: {
    rule_name: "청년 주거 지원",
    title: "청년 월세 지원금",
    deadline: "2026-05-31",
    detail_path: "/welfare/sample-policy-id",
  },
  POLICY_NEW_V3: {
    user_name: "최관철",
    rule_name: "소상공인 정책자금",
    title: "고유가 피해 소상공인 지원금",
    announced_at: "4월 28일",
    eligibility_status: "✓ 자격 충족 (매출 5억 이하·5인 미만)",
    benefit_summary: "최대 60만원",
    deadline: "5월 31일까지 (D-30)",
    detail_path: "/welfare/sample-policy-id",
  },
};

// 템플릿별 변수 메타 (라벨·placeholder)
const VAR_META: Record<TemplateKey, { key: string; label: string; hint?: string }[]> = {
  POLICY_NEW: [
    { key: "rule_name", label: "rule_name", hint: "사용자가 등록한 알림 규칙 이름" },
    { key: "title", label: "title", hint: "정책 제목" },
    { key: "deadline", label: "deadline", hint: "신청 마감 (ISO date 또는 '상시')" },
    { key: "detail_path", label: "detail_path", hint: "/welfare/{id} 또는 /loan/{id}" },
  ],
  POLICY_NEW_V3: [
    { key: "user_name", label: "user_name", hint: "사용자 이름 또는 닉네임" },
    { key: "rule_name", label: "rule_name" },
    { key: "title", label: "title" },
    { key: "announced_at", label: "announced_at", hint: "M월 D일 (예: '4월 28일')" },
    { key: "eligibility_status", label: "eligibility_status", hint: "자격 진단 결과 한 줄" },
    { key: "benefit_summary", label: "benefit_summary", hint: "예: 최대 60만원" },
    { key: "deadline", label: "deadline" },
    { key: "detail_path", label: "detail_path" },
  ],
};

// 본문 렌더링 — 카카오비즈 등록 원문과 1:1 매칭. 변수 치환 결과를 그대로
// 사장님이 보게 됨.
function renderBody(template: TemplateKey, vars: Record<string, string>): string {
  if (template === "POLICY_NEW") {
    return [
      "[keepioo] 새 맞춤 정책 알림",
      "",
      `${vars.rule_name || "(rule_name)"} 조건에 맞는 새 정책이 등록되었습니다.`,
      "",
      `▸ 정책명: ${vars.title || "(title)"}`,
      `▸ 신청 마감: ${vars.deadline || "(deadline)"}`,
      "",
      "자세한 지원 조건과 신청 방법은 아래에서 확인하실 수 있습니다.",
      "",
      "※ 본 메시지는 고객님께서 keepioo 마이페이지에서 직접 요청하신 맞춤 알림 조건에 해당하는 새로운 정책이 있을 경우 매번 발송되는 정보성 메시지입니다. 수신을 원하지 않으실 경우 마이페이지 > 알림 설정에서 언제든 해지 가능합니다.",
    ].join("\n");
  }
  // POLICY_NEW_V3
  return [
    "[keepioo] 새 맞춤 정책 알림",
    "",
    `${vars.user_name || "(user_name)"}님,`,
    `${vars.rule_name || "(rule_name)"} 조건에 맞는 새 정책이 등록되었습니다.`,
    "",
    `✅ 정책명: ${vars.title || "(title)"}`,
    `✅ 발표일: ${vars.announced_at || "(announced_at)"}`,
    `✅ 사장님 자격: ${vars.eligibility_status || "(eligibility_status)"}`,
    `✅ 지원 금액: ${vars.benefit_summary || "(benefit_summary)"}`,
    `✅ 신청 마감: ${vars.deadline || "(deadline)"}`,
    "",
    "자세한 신청 조건과 절차는 아래에서 확인하실 수 있습니다.",
    "",
    "※ 본 메시지는 고객님께서 keepioo 마이페이지에서 직접 요청하신 맞춤 알림 조건과 사장님 가게 정보로 자동 매칭된 새로운 정책이 있을 경우 매번 발송되는 정보성 메시지입니다. 수신을 원하지 않으실 경우 마이페이지 > 알림 설정에서 언제든 해지 가능합니다.",
  ].join("\n");
}

// 버튼 라벨은 양 템플릿 동일. URL = 도메인 고정 + detail_path 변수.
const BUTTON_LABEL_PRIMARY: Record<TemplateKey, string> = {
  POLICY_NEW: "정책 자세히 보기",
  POLICY_NEW_V3: "자세히 보고 신청하기",
};

export function AlimtalkPreviewCard() {
  const [template, setTemplate] = useState<TemplateKey>("POLICY_NEW");
  const [vars, setVars] = useState<Record<TemplateKey, Record<string, string>>>({
    POLICY_NEW: { ...DEFAULTS.POLICY_NEW },
    POLICY_NEW_V3: { ...DEFAULTS.POLICY_NEW_V3 },
  });

  const currentVars = vars[template];
  const body = renderBody(template, currentVars);
  const detailUrl = `https://www.keepioo.com${currentVars.detail_path || ""}`;
  const charCount = body.length;
  // 카카오 알림톡 본문 1,000자 제한 — 자유게시 vs 변수 치환 결과 둘 다 적용
  const overLimit = charCount > 1000;

  function updateVar(key: string, value: string) {
    setVars((prev) => ({
      ...prev,
      [template]: { ...prev[template], [key]: value },
    }));
  }

  function resetToDefaults() {
    setVars((prev) => ({ ...prev, [template]: { ...DEFAULTS[template] } }));
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,360px)_1fr]">
      {/* 좌: 변수 입력 폼 */}
      <div>
        {/* 템플릿 토글 */}
        <div className="mb-4 inline-flex rounded-lg border border-grey-200 bg-white overflow-hidden">
          {(["POLICY_NEW", "POLICY_NEW_V3"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTemplate(t)}
              className={`px-3 py-2 text-[12px] font-semibold transition-colors ${
                template === t
                  ? "bg-blue-500 text-white"
                  : "bg-white text-grey-700 hover:bg-grey-50"
              }`}
            >
              {t === "POLICY_NEW" ? "POLICY_NEW (v2)" : "POLICY_NEW_V3"}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-grey-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-grey-900">변수 입력</p>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-[11px] text-blue-500 hover:underline"
            >
              샘플로 초기화
            </button>
          </div>

          <div className="space-y-2.5">
            {VAR_META[template].map((meta) => (
              <label key={meta.key} className="block">
                <div className="flex items-baseline justify-between mb-0.5">
                  <code className="text-[11px] text-grey-700 font-mono">
                    {meta.label}
                  </code>
                  {meta.hint && (
                    <span className="text-[10px] text-grey-500">{meta.hint}</span>
                  )}
                </div>
                <input
                  type="text"
                  value={currentVars[meta.key] ?? ""}
                  onChange={(e) => updateVar(meta.key, e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-grey-200 rounded text-[12px] text-grey-900 focus:border-blue-500 outline-none"
                />
              </label>
            ))}
          </div>

          {/* 글자 수 게이지 — 카카오 1,000자 제한 */}
          <div
            className={`mt-3 text-[11px] ${
              overLimit ? "text-red font-semibold" : "text-grey-600"
            }`}
          >
            본문 {charCount}자 / 1,000자
            {overLimit && " — 카카오 한도 초과"}
          </div>
        </div>
      </div>

      {/* 우: 카톡 카드 시각화 */}
      <div>
        <p className="text-[13px] font-bold text-grey-900 mb-3">카톡 카드 미리보기</p>
        <div className="bg-[#abc1d1] rounded-2xl p-4 max-w-[400px] min-h-[300px]">
          {/* 발송자 채널 헤더 — 카카오톡 채널 알림은 채널 이름이 상단에 표시 */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-[12px] font-bold text-black">
              ke
            </div>
            <p className="text-[12px] font-semibold text-white drop-shadow-sm">
              keepioo
            </p>
          </div>

          {/* 알림톡 본문 카드 (둥근 직사각형 흰색 배경) */}
          <div className="bg-white rounded-xl overflow-hidden shadow-sm">
            {/* 알림톡 헤더 라벨 (노란색 띠) */}
            <div className="bg-yellow-300 px-3 py-1.5">
              <p className="text-[11px] font-bold text-black tracking-tight">
                알림톡 도착
              </p>
            </div>

            {/* 본문 영역 — whitespace-pre-line 으로 \n 줄바꿈 보존 */}
            <div className="p-4">
              <p className="text-[13px] text-grey-900 leading-[1.55] whitespace-pre-line break-keep">
                {body}
              </p>
            </div>

            {/* 버튼 영역 — 회색 배경, 위/아래 분할 */}
            <div className="border-t border-grey-100">
              <a
                href={detailUrl}
                target="_blank"
                rel="noreferrer"
                className="block py-2.5 text-center text-[13px] font-semibold text-grey-900 hover:bg-grey-50 transition-colors no-underline"
              >
                {BUTTON_LABEL_PRIMARY[template]}
              </a>
              <a
                href="https://www.keepioo.com/mypage/notifications"
                target="_blank"
                rel="noreferrer"
                className="block py-2.5 text-center text-[13px] font-semibold text-grey-700 border-t border-grey-100 hover:bg-grey-50 transition-colors no-underline"
              >
                알림 설정 변경
              </a>
            </div>
          </div>

          {/* 시각/시간 (카톡 채널 알림 메타) */}
          <p className="text-[10px] text-white/80 mt-2 text-right drop-shadow-sm">
            샘플 — 실제 발송 시각 표기 자리
          </p>
        </div>

        {/* 보조 정보 */}
        <div className="mt-3 rounded-lg border border-grey-200 bg-grey-50 p-3 text-[11px] text-grey-700 leading-[1.6]">
          <p className="mb-1">
            <strong className="text-grey-900">버튼 1 URL:</strong>{" "}
            <code className="text-blue-700 font-mono break-all">{detailUrl}</code>
          </p>
          <p>
            <strong className="text-grey-900">버튼 2 URL:</strong>{" "}
            <code className="text-blue-700 font-mono">
              https://www.keepioo.com/mypage/notifications
            </code>
          </p>
          <p className="mt-2 text-grey-600">
            ※ 변수만 바꾸어 미리보기 — 실제 발송은 위{" "}
            <strong>테스트 발송</strong> 폼 사용 (본인 번호 카카오톡으로 수신).
          </p>
        </div>
      </div>
    </div>
  );
}
