import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/subscription";
import { getPostCheckoutActivationCopy } from "@/lib/checkout/post-checkout-copy";
import { PostCheckoutActivationChecklist } from "./post-checkout-activation-checklist";

export const metadata: Metadata = {
  title: "구독 시작 — 정책알리미",
  description: "결제 후 마감 감시 기능을 바로 켜세요.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  tier?: string;
}>;

export default async function CheckoutActivationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/checkout/activation");
  }

  const actualTier = await getUserTier(user.id);
  if (actualTier !== "basic" && actualTier !== "pro") {
    redirect("/pricing?from=checkout-activation&recommended=basic");
  }

  const { tier: requestedTier } = await searchParams;
  const tier = requestedTier === actualTier ? requestedTier : actualTier;
  const copy = getPostCheckoutActivationCopy(tier);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="mx-auto max-w-[680px] px-5">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-[34px]">
            ✓
          </div>
          <p className="mb-2 text-[13px] font-bold tracking-[0.16em] text-emerald-600">
            SUBSCRIPTION READY
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.8px] text-grey-900">
            구독 등록이 완료됐어요
          </h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-grey-700">
            이제 키피오가 사장님 조건에 맞는 정책과 마감일을 감시할 수 있게,
            아래 2가지만 바로 끝내면 됩니다.
          </p>
        </div>

        <PostCheckoutActivationChecklist tier={tier} copy={copy} />

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <a
            href="/alerts?from=checkout-activation"
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-blue-200 bg-white px-5 text-[14px] font-bold text-blue-700 no-underline hover:bg-blue-50"
          >
            내 마감 감시 상태 보기
          </a>
          <a
            href="/mypage/billing?welcome=1"
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-grey-200 bg-white px-5 text-[14px] font-bold text-grey-700 no-underline hover:bg-grey-50"
          >
            구독 정보 보기
          </a>
        </div>
      </div>
    </main>
  );
}
