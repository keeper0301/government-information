"use client";

import { useState } from "react";
import { getAlarmEligibilityState } from "@/lib/alerts/alarm-eligibility";
import { buildBasicPricingHref } from "@/lib/pricing/cta-links";

type Props = {
  programId: string;
  programType: "welfare" | "loan";
};

const upgradeHref = buildBasicPricingHref("policy-detail");

export function AlarmButton({ programId, programType }: Props) {
  const [status, setStatus] = useState<"idle" | "checking" | "loading" | "success" | "error" | "upgrade">("idle");
  const [message, setMessage] = useState("");

  async function registerAlarm(email: string) {
    setStatus("loading");
    try {
      const res = await fetch("/api/alarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, programId, programType }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "마감 7일 전 이메일 알림을 켰어요.");
        return;
      }

      if (data?.needsUpgrade) {
        window.location.assign(data.upgradeUrl || upgradeHref);
        return;
      }
      if (data?.needsLogin) {
        window.location.assign(upgradeHref);
        return;
      }

      setStatus("error");
      setMessage(data.error || "오류가 발생했습니다.");
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }

  async function handleClick() {
    setStatus("checking");
    setMessage("");

    try {
      const eligibility = await getAlarmEligibilityState();
      if (!eligibility.loggedIn || !eligibility.canCreateAlert) {
        window.location.assign(upgradeHref);
        return;
      }
      if (!eligibility.email) {
        setStatus("error");
        setMessage("계정 이메일을 확인할 수 없습니다.");
        return;
      }
      await registerAlarm(eligibility.email);
    } catch {
      setStatus("error");
      setMessage("알림 가능 여부를 확인하지 못했습니다.");
    }
  }

  if (status === "success") {
    return (
      <div className="px-6 py-3 bg-blue-50 text-blue-600 text-[15px] font-medium rounded-xl">
        {message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "checking" || status === "loading"}
        className="px-6 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl border-none cursor-pointer hover:bg-grey-200 transition-colors font-pretendard disabled:opacity-60 disabled:cursor-wait"
      >
        {status === "checking"
          ? "구독 확인 중..."
          : status === "loading"
            ? "알림 켜는 중..."
            : "마감 알림 받기"}
      </button>
      {status === "error" && <span className="text-[12px] text-red">{message}</span>}
      {status === "upgrade" && (
        <a href={upgradeHref} className="text-[12px] font-semibold text-blue-600 underline">
          Basic으로 마감 알림 켜기
        </a>
      )}
    </div>
  );
}
