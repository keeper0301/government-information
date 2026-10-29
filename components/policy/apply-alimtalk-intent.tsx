"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getAlarmEligibilityState } from "@/lib/alerts/alarm-eligibility";

type Props = {
  programId: string;
  programType: "welfare" | "loan";
};

export function ApplyAlimtalkIntent({ programId, programType }: Props) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const intent = search.get("intent");
  const handled = useRef(false);

  useEffect(() => {
    if (intent !== "apply-alimtalk" || handled.current) return;
    handled.current = true;
    const currentSearch = search.toString();

    async function finish() {
      const eligibility = await getAlarmEligibilityState();
      if (!eligibility.loggedIn) {
        setMessage(null);
      } else if (eligibility.canCreateAlert && eligibility.email) {
        const res = await fetch("/api/alarm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: eligibility.email,
            programId,
            programType,
          }),
        });
        setMessage(res.ok
          ? "마감 알림을 저장했어요. 신청 방법은 이 화면에 있어요."
          : "로그인됐어요. 신청 방법은 이 화면에 있어요.");
      } else {
        setMessage("로그인됐어요. 신청 방법은 이 화면에 있어요.");
      }

      const params = new URLSearchParams(currentSearch);
      params.delete("intent");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }

    finish().catch(() => {
      setMessage("로그인됐어요. 신청 방법은 이 화면에 있어요.");
    });
  }, [intent, pathname, programId, programType, router, search]);

  if (!message) return null;
  return (
    <p role="status" className="mb-3 rounded-xl bg-blue-50 px-4 py-3 text-[14px] font-medium leading-[1.6] text-blue-700">
      {message}
    </p>
  );
}
