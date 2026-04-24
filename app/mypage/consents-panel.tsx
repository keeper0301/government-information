"use client";

// ============================================================
// ConsentsPanel — 동의 현황 + 선택 동의 토글
// ============================================================
// 서버에서 받은 현재 active 동의 상태를 보여주고,
// 선택 동의(marketing / sensitive_topic / kakao_messaging)는 토글로 철회/재동의.
// 실제 기록은 /api/consent 가 처리 (IP·UA 서버에서 추출).
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

type ConsentType =
  | "privacy_policy"
  | "terms"
  | "marketing"
  | "sensitive_topic"
  | "kakao_messaging";

type ConsentStatus = {
  consentType: ConsentType;
  version: string;
  consentedAt: string;
  isActive: boolean;
};

// 표시용 메타 (라벨, 설명, 필수 여부)
const CONSENT_META: {
  type: ConsentType;
  label: string;
  description: string;
  required: boolean;
}[] = [
  {
    type: "privacy_policy",
    label: "개인정보처리방침",
    description: "회원가입·맞춤 추천·알림 발송을 위한 개인정보 수집·이용",
    required: true,
  },
  {
    type: "terms",
    label: "이용약관",
    description: "서비스 이용 관련 권리·의무·책임 범위",
    required: true,
  },
  {
    type: "marketing",
    label: "마케팅 정보 수신",
    description: "이메일·카톡으로 혜택·이벤트 소식을 받아볼게요",
    required: false,
  },
  {
    type: "sensitive_topic",
    label: "민감 토픽 분석 동의",
    description: "건강·소득 관련 맞춤 추천을 위한 민감 정보 활용",
    required: false,
  },
  {
    type: "kakao_messaging",
    label: "카카오 알림톡 수신",
    description: "새 정책 소식을 카카오톡 알림톡으로 받아볼게요",
    required: false,
  },
];

export function ConsentsPanel({
  initialConsents,
}: {
  initialConsents: ConsentStatus[];
}) {
  const router = useRouter();
  // 현재 active 상태를 Map 으로 관리 (낙관적 업데이트)
  const [active, setActive] = useState<Record<ConsentType, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const c of initialConsents) {
      map[c.consentType] = c.isActive;
    }
    return map as Record<ConsentType, boolean>;
  });
  const [busy, setBusy] = useState<ConsentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 동의 시점 표시용 맵 (있을 때만)
  const consentedAtMap: Record<string, string> = {};
  for (const c of initialConsents) {
    if (c.isActive) consentedAtMap[c.consentType] = c.consentedAt;
  }

  async function handleToggle(type: ConsentType, required: boolean) {
    if (required) return; // 필수는 토글 불가
    const currentlyActive = active[type] === true;
    const nextAction = currentlyActive ? "withdraw" : "record";

    setBusy(type);
    setError(null);
    setMessage(null);

    // 낙관적 업데이트
    setActive((prev) => ({ ...prev, [type]: !currentlyActive }));

    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction, consentType: type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "실패" }));
        throw new Error(data.error || "실패");
      }
      setMessage(currentlyActive ? "동의를 철회했어요." : "동의를 기록했어요.");
      router.refresh(); // 서버 상태 동기화
    } catch (err) {
      // 롤백
      setActive((prev) => ({ ...prev, [type]: currentlyActive }));
      const msg = err instanceof Error ? err.message : "처리 중 문제가 생겼어요.";
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* 알림 메시지 */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-4">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-600 font-medium mb-4">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {CONSENT_META.map(({ type, label, description, required }) => {
          const isOn = active[type] === true;
          const consentedAt = consentedAtMap[type];
          return (
            <div
              key={type}
              className="flex items-start justify-between gap-4 p-4 border border-grey-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      required
                        ? "bg-red/10 text-red"
                        : "bg-grey-100 text-grey-600"
                    }`}
                  >
                    {required ? "필수" : "선택"}
                  </span>
                  <span className="text-[15px] font-semibold text-grey-900">
                    {label}
                  </span>
                </div>
                <p className="text-[13px] text-grey-600 leading-[1.5] mb-1">
                  {description}
                </p>
                {consentedAt && (
                  <p className="text-[12px] text-grey-500">
                    {new Date(consentedAt).toLocaleDateString("ko-KR")} 동의
                  </p>
                )}
              </div>

              {/* 토글 또는 고정 상태 표시 */}
              {required ? (
                <div className="text-[13px] font-semibold text-grey-700 pt-1">
                  동의
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggle(type, required)}
                  disabled={busy === type}
                  aria-pressed={isOn}
                  className={`relative w-[46px] h-[26px] rounded-full transition-colors cursor-pointer border-none flex-shrink-0 mt-0.5 disabled:opacity-50 ${
                    isOn ? "bg-blue-500" : "bg-grey-300"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] w-[20px] h-[20px] bg-white rounded-full transition-transform ${
                      isOn ? "translate-x-[23px]" : "translate-x-[3px]"
                    }`}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
