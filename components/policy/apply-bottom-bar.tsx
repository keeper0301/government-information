"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ApplyClickTracker } from "@/components/analytics/apply-click-tracker";
import { PhoneClickLink } from "@/components/analytics/phone-click-link";
import { trackPolicyDetailEvent } from "@/lib/analytics/policy-detail-events";
import type { ApplyPrimary, ApplySecondary } from "@/lib/policy/apply-action-model";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
  primary: ApplyPrimary;
  secondary: ApplySecondary | null;
};

const secondaryClass = "inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-grey-200 bg-white px-4 text-[15px] font-semibold text-grey-800 no-underline";
const primaryClass = "inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-blue-500 px-4 text-center text-[15px] font-bold text-white no-underline";

export function ApplyBottomBar({ programId, programTable, sourcePage, primary, secondary }: Props) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "calc(5.5rem + env(safe-area-inset-bottom))";
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, []);

  async function startAlimtalk() {
    if (pending) return;
    setPending(true);
    trackPolicyDetailEvent({
      eventType: "alimtalk_signup_click",
      programId,
      programTable,
      sourcePage,
    });
    const next = `${sourcePage}?intent=apply-alimtalk`;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        window.location.assign(next);
        return;
      }
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: callbackUrl },
      });
      if (error) window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    } catch {
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-grey-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-content items-center gap-2 px-4 pt-3 max-md:pr-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {secondary?.type === "phone" && (
          <PhoneClickLink
            programId={programId}
            programTable={programTable}
            sourcePage={sourcePage}
            href={secondary.tel}
            className={secondaryClass}
          >
            📞 전화 문의
          </PhoneClickLink>
        )}
        {secondary?.type === "source" && (
          <a href={secondary.href} target="_blank" rel="noopener noreferrer" className={secondaryClass}>
            출처 보기
          </a>
        )}
        {primary.type === "apply" && (
          <ApplyClickTracker
            programId={programId}
            programTable={programTable}
            sourcePage={sourcePage}
            href={primary.href}
            className={primaryClass}
          >
            {primary.label}
          </ApplyClickTracker>
        )}
        {primary.type === "source" && (
          <a href={primary.href} target="_blank" rel="noopener noreferrer" className={primaryClass}>
            {primary.label}
          </a>
        )}
        {primary.type === "alimtalk" && (
          <button type="button" onClick={startAlimtalk} disabled={pending} className={`${primaryClass} border-none disabled:opacity-60`}>
            {pending ? "연결 중..." : primary.label}
          </button>
        )}
      </div>
    </div>
  );
}
