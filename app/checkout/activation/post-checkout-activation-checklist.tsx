"use client";

import Link from "next/link";
import { EVENTS, trackEvent } from "@/lib/analytics";
import type { PostCheckoutActivationCopy } from "@/lib/checkout/post-checkout-copy";

export function PostCheckoutActivationChecklist({
  tier,
  copy,
}: {
  tier: "basic" | "pro";
  copy: PostCheckoutActivationCopy;
}) {
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_8px_30px_rgba(37,99,235,0.06)]">
      <div className="mb-5">
        <p className="mb-1 text-[12px] font-bold tracking-[0.16em] text-blue-600">
          ACTIVATION CHECKLIST
        </p>
        <h2 className="text-[22px] font-extrabold tracking-[-0.6px] text-grey-900">
          {copy.title}
        </h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-grey-700">
          {copy.description}
        </p>
      </div>

      <ol className="space-y-3">
        {copy.actions.map((action, index) => (
          <li
            key={action.analyticsAction}
            className="rounded-2xl border border-grey-100 bg-grey-50 px-4 py-3"
          >
            <div className="flex items-start gap-3 max-sm:flex-col">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[14px] font-extrabold text-white">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-grey-900">{action.label}</p>
                <p className="mt-1 text-[12px] leading-[1.5] text-grey-600">
                  {action.description}
                </p>
              </div>
              <Link
                href={action.href}
                onClick={() => {
                  trackEvent(EVENTS.POST_CHECKOUT_ACTIVATION_CLICKED, {
                    tier,
                    action: action.analyticsAction,
                    step: index + 1,
                  });
                }}
                className={`inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-xl px-4 text-[13px] font-bold no-underline transition-colors ${
                  action.tone === "primary"
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                시작 →
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
