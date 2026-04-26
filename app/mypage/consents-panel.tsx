"use client";

// ============================================================
// ConsentsPanel — 동의 현황 + 선택 동의 토글
// ============================================================
// 서버에서 받은 현재 active 동의 상태를 보여주고,
// 선택 동의(marketing / sensitive_topic / kakao_messaging)는 토글로 철회/재동의.
// 실제 기록은 /api/consent 가 처리 (IP·UA 서버에서 추출).
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";

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

// 필수 동의의 현재 시행 버전 (서버에서 주입)
type CurrentVersions = {
  privacy_policy: string;
  terms: string;
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
  currentVersions,
}: {
  initialConsents: ConsentStatus[];
  currentVersions: CurrentVersions;
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

  // 서버에서 refresh 된 initialConsents 로 로컬 state 동기화
  // (지금 동의 버튼 누른 후 router.refresh() 로 새 데이터 들어왔을 때 반영)
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const c of initialConsents) {
      next[c.consentType] = c.isActive;
    }
    setActive(next as Record<ConsentType, boolean>);
  }, [initialConsents]);

  // 기록 요약 맵 (active 인 동의의 version·consentedAt)
  const recordMap: Record<string, { version: string; consentedAt: string }> = {};
  for (const c of initialConsents) {
    if (c.isActive) {
      recordMap[c.consentType] = {
        version: c.version,
        consentedAt: c.consentedAt,
      };
    }
  }

  // 필수 동의 중 "기록 없음" 또는 "구버전" 이면 재동의 필요로 판정
  function needsAck(type: ConsentType, required: boolean): boolean {
    if (!required) return false;
    if (type !== "privacy_policy" && type !== "terms") return false;
    const rec = recordMap[type];
    if (!rec) return true; // 기록 없음
    return rec.version < currentVersions[type]; // 구버전
  }

  async function handleToggle(type: ConsentType, required: boolean) {
    if (required) return; // 필수는 토글 불가 (철회는 탈퇴 흐름)
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
      // 선택 동의 철회는 신뢰 이슈 신호 → 별도 이벤트로 추적 (카톡·마케팅 이탈 비율 등)
      if (nextAction === "withdraw") {
        trackEvent(EVENTS.CONSENT_WITHDRAWN, { consent_type: type });
      }
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

  // 필수 동의 "지금 동의" 버튼용 — 기록 없거나 구버전 → 현재 버전으로 record
  async function handleAck(type: ConsentType) {
    setBusy(type);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record", consentType: type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "실패" }));
        throw new Error(data.error || "실패");
      }
      setMessage("동의를 기록했어요.");
      // 재동의 배너·빨강 카드 "지금 동의" 에서 왔을 때 — 방침 개정 후 회복율 측정
      trackEvent(EVENTS.RECONSENT_ACKNOWLEDGED, { consent_type: type });
      router.refresh();
    } catch (err) {
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

      {/* 필수 / 선택 그룹으로 분리 — 사용자가 "이건 못 끄는 건가?" 헷갈리지 않도록 */}
      <div className="space-y-8">
        {/* ── 필수 동의 ── */}
        <section>
          <h3 className="text-[14px] font-semibold text-grey-900 mb-3 pb-2 border-b border-grey-100">
            필수 동의{" "}
            <span className="text-xs font-normal text-grey-600">
              (철회는 회원 탈퇴로만 가능)
            </span>
          </h3>
          <div className="space-y-2">
            {CONSENT_META.filter((m) => m.required).map((meta) => (
              <ConsentRow
                key={meta.type}
                meta={meta}
                isOn={active[meta.type] === true}
                needs={needsAck(meta.type, meta.required)}
                consentedAt={recordMap[meta.type]?.consentedAt}
                busy={busy === meta.type}
                onAck={() => handleAck(meta.type)}
                onToggle={() => handleToggle(meta.type, meta.required)}
              />
            ))}
          </div>
        </section>

        {/* ── 선택 동의 ── */}
        <section>
          <h3 className="text-[14px] font-semibold text-grey-900 mb-3 pb-2 border-b border-grey-100">
            선택 동의{" "}
            <span className="text-xs font-normal text-grey-600">
              (언제든 끄고 켤 수 있어요)
            </span>
          </h3>
          <div className="space-y-2">
            {CONSENT_META.filter((m) => !m.required).map((meta) => (
              <ConsentRow
                key={meta.type}
                meta={meta}
                isOn={active[meta.type] === true}
                needs={false}
                consentedAt={recordMap[meta.type]?.consentedAt}
                busy={busy === meta.type}
                onAck={() => handleAck(meta.type)}
                onToggle={() => handleToggle(meta.type, meta.required)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ConsentRow — 동의 1건 카드. 필수/선택 그룹 어디든 동일하게 사용.
// 필수 + 최신 버전 → "동의완료" 배지
// 필수 + 구버전·미기록 → 재동의 카드(빨강) + "지금 동의" 버튼
// 선택 → 토글
function ConsentRow({
  meta,
  isOn,
  needs,
  consentedAt,
  busy,
  onAck,
  onToggle,
}: {
  meta: (typeof CONSENT_META)[number];
  isOn: boolean;
  needs: boolean;
  consentedAt: string | undefined;
  busy: boolean;
  onAck: () => void;
  onToggle: () => void;
}) {
  const dateLabel = consentedAt
    ? new Date(consentedAt).toLocaleDateString("ko-KR")
    : null;

  return (
    <div
      className={`flex items-start justify-between gap-4 px-4 py-3 border rounded-lg ${
        needs
          ? "border-red/40 bg-red/5"
          : "border-grey-200 bg-white"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {meta.required && (
            <span aria-hidden className="text-[11px]">
              🔒
            </span>
          )}
          <span className="text-[14px] font-semibold text-grey-900">
            {meta.label}
          </span>
          {dateLabel && !needs && (
            <span className="ml-auto text-[11px] text-grey-600 whitespace-nowrap">
              {dateLabel} 동의
            </span>
          )}
        </div>
        <p className="text-[12px] text-grey-700 leading-[1.5]">
          {meta.description}
        </p>
        {needs && (
          <p className="text-[12px] text-red font-medium mt-1">
            ⚠️ 최신 방침에 대한 동의 기록이 없어요. 확인해 주세요.
          </p>
        )}
      </div>

      <div className="shrink-0 self-center">
        {meta.required ? (
          needs ? (
            <button
              type="button"
              onClick={onAck}
              disabled={busy}
              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-red rounded-md border-none cursor-pointer hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
            >
              지금 동의
            </button>
          ) : (
            <span className="text-[12px] font-medium text-emerald-700 px-2 py-1 bg-emerald-50 rounded whitespace-nowrap">
              동의완료
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            aria-pressed={isOn}
            className={`relative w-[46px] h-[26px] rounded-full transition-colors cursor-pointer border-none disabled:opacity-50 ${
              isOn ? "bg-blue-500" : "bg-grey-300"
            }`}
          >
            <span
              className={`absolute top-[3px] w-[20px] h-[20px] bg-white rounded-full transition-transform ${
                isOn ? "translate-x-[23px]" : "translate-x-[3px]"
              }`}
            />
            <span className="sr-only">
              {meta.label} {isOn ? "끄기" : "켜기"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
