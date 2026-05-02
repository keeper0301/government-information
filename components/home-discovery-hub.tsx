import { Suspense, type ReactNode } from "react";
import { HomeTargetCards } from "@/components/home-target-cards";
import { RevealOnScroll } from "@/components/reveal-on-scroll";

export function HomeDiscoveryHub({
  regionMap,
}: {
  regionMap: ReactNode;
}) {
  return (
    <section aria-labelledby="home-discovery-title" className="bg-white">
      <div className="max-w-content mx-auto px-10 pt-16 max-md:px-6 max-md:pt-12">
        <div className="mb-8">
          <p className="text-[13px] font-bold text-blue-500 mb-2">
            정책 탐색 허브
          </p>
          <h2
            id="home-discovery-title"
            className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.8px] text-grey-900"
          >
            맞춤 추천 다음은 직접 골라보세요
          </h2>
          <p className="mt-3 max-w-[620px] text-[15px] leading-[1.7] text-grey-600">
            복지·대출·지역·대상·마감임박 정책을 한 흐름에서 확인할 수 있어요.
          </p>
        </div>
      </div>

      <HomeTargetCards />

      <RevealOnScroll>
        <Suspense fallback={<div className="h-[600px]" aria-hidden />}>
          {regionMap}
        </Suspense>
      </RevealOnScroll>

    </section>
  );
}
