import Link from "next/link";
import { Suspense } from "react";
import { RegionMap } from "@/components/region-map";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import { HomeTargetCards } from "@/components/home-target-cards";
import { getGuides } from "@/lib/policy-guides";

/** 로그인 없이 읽을 수 있는 홈에 실제 공개 판정을 통과한 안내만 추천합니다. */
export async function HomeEditorialShell() {
  const publishedGuides = await getGuides(50, { publicationOnly: true });
  const guides = [
    ["서류부터 준비하려면", "정부지원금 신청 전 준비 서류 체크리스트", "documents-before-government-benefit"],
    ["사업자 자금을 찾는다면", "소상공인 정책자금 신청에서 확인할 것", "small-business-policy-fund-mistakes"],
    ["월세 지원을 알아본다면", "청년 월세 지원 신청 전 체크리스트", "youth-rent-checklist-2026"],
    ["이미 지원을 받고 있다면", "중복 수급 제한을 확인하는 방법", "policy-duplicate-benefit-limits"],
  ].filter(([, , slug]) => {
    return publishedGuides.some(item => item.slug === slug);
  });
  return <>
    <section className="bg-blue-50 px-6 pt-[112px] pb-12 lg:px-10 lg:pt-36 lg:pb-16">
      <div className="max-w-content mx-auto">
        <p className="text-sm font-semibold text-blue-600 mb-4">keepioo · 신청 전 확인 가이드</p>
        <h1 className="text-[32px] md:text-[44px] font-extrabold leading-[1.3] tracking-[-1px] text-grey-900 mb-5">지원금 신청 전,<br />자격과 서류부터 확인하세요</h1>
        <p className="max-w-2xl text-[16px] leading-[1.8] text-grey-700 mb-6">keepioo는 공공 지원제도의 서류·중복 제한·접수 확인 순서를 정리하는 민간 정보 서비스입니다. 신청과 선정 판단은 담당 기관의 최신 공고가 기준입니다.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/guides" className="min-h-12 inline-flex items-center rounded-full bg-blue-600 text-white px-6 font-semibold no-underline hover:bg-blue-700 focus-visible:outline-2">신청 가이드 보기 →</Link>
          <Link href="/editorial-policy" className="min-h-12 inline-flex items-center rounded-full bg-white px-6 text-grey-900 font-semibold no-underline hover:bg-grey-50">운영 기준 보기</Link>
        </div>
      </div>
    </section>
    {/* 지도 자료를 기다리는 동안에도 신청 가이드는 먼저 보여줍니다. */}
    {ADSENSE_REVIEW_MODE && <Suspense fallback={<p className="max-w-content mx-auto px-6 py-10" role="status">지역 지도를 불러오는 중입니다.</p>}><RegionMap /></Suspense>}
    <section className="max-w-content mx-auto px-6 lg:px-10 py-12" aria-labelledby="first-guides">
      <h2 id="first-guides" className="text-2xl font-bold mb-6">무엇부터 확인할까요?</h2>
      {guides.length === 0 && <p className="mb-6 leading-relaxed text-grey-700">신청 가이드는 공식 출처 대조와 운영자 검수를 거친 뒤 안내합니다. 지금은 대상별 확인 순서와 공식 기관의 공고를 먼저 확인하세요.</p>}
      <div className="grid gap-4 md:grid-cols-2">{guides.map(([task, title, slug]) => <Link key={slug} href={`/guides/${slug}`} className="p-6 rounded-2xl border border-grey-200 no-underline hover:border-blue-400 focus-visible:outline-2"><span className="block text-sm text-grey-600 mb-2">{task}</span><span className="font-bold text-grey-900">{title} →</span></Link>)}</div>
    </section>
    <HomeTargetCards publishedSlugs={publishedGuides.map(guide => guide.slug)} />
    <section className="max-w-content mx-auto px-6 lg:px-10 py-12">
      <h2 className="text-2xl font-bold mb-5">공식 기관에서 신청하는 순서</h2>
      <ol className="list-decimal pl-6 space-y-3 text-grey-700 leading-relaxed"><li>가이드로 준비할 질문과 자료를 정리합니다.</li><li>공식 공고에서 지역·회차·제외 대상·접수 상태를 확인합니다.</li><li>공고가 안내하는 신청처에서 제출하고 접수 결과를 보관합니다.</li></ol>
      <p className="mt-6 text-sm leading-relaxed text-grey-600">출처 확인은 사람의 편집 검수나 신청 자격 승인과 다릅니다. <Link href="/source-policy" className="text-blue-600 underline">출처 기준</Link>과 <Link href="/correction-policy" className="text-blue-600 underline">정정 절차</Link>를 확인하고, 오류는 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>로 알려주세요.</p>
    </section>
  </>;
}
