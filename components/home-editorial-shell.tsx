import Link from "next/link";
import { Suspense } from "react";
import { RegionMap } from "@/components/region-map";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import { HomeTargetCards } from "@/components/home-target-cards";
import { getGuides } from "@/lib/policy-guides";
import { getGuideEvidence } from "@/lib/guide-evidence";
import { loadPublishedNews } from "@/lib/news-publication/feed";
import { EditorialNewsCards } from "@/components/news/editorial-news-pages";

/** 로그인 없이 읽을 수 있는 홈에 실제 공개 판정을 통과한 안내만 추천합니다. */
export function HomeEditorialShell() {
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
    <section className="max-w-content mx-auto px-6 lg:px-10 py-12" aria-labelledby="before-applying">
      <h2 id="before-applying" className="text-2xl font-bold mb-5">신청 전 3가지 확인</h2>
      <ol className="grid gap-4 sm:grid-cols-3">
        <li className="rounded-2xl border border-grey-200 p-5"><h3 className="font-bold mb-2">1. 내 조건과 공고를 대조</h3><p className="text-sm leading-relaxed text-grey-700">공고의 지역·가구·소득 기준일을 따로 적어 보세요. 작년 공고나 비슷한 이름의 다른 지역 사업은 기준이 다를 수 있습니다.</p></li>
        <li className="rounded-2xl border border-grey-200 p-5"><h3 className="font-bold mb-2">2. 서류 발급과 접수를 구분</h3><p className="text-sm leading-relaxed text-grey-700">제출처가 요구하는 발급일과 표시 항목을 확인한 뒤 서류를 준비하세요. 발급한 서류가 있다고 접수된 것은 아닙니다.</p></li>
        <li className="rounded-2xl border border-grey-200 p-5"><h3 className="font-bold mb-2">3. 신청 뒤 접수 결과를 확인</h3><p className="text-sm leading-relaxed text-grey-700">담당 기관에서 제출한 뒤 접수번호를 보관하고, 보완 요청과 마감일을 확인하세요. 접수 완료는 선정 확정과 다릅니다.</p></li>
      </ol>
      <p className="mt-6 text-sm leading-relaxed text-grey-600">출처 확인은 사람의 편집 검수나 신청 자격 승인과 다릅니다. <Link href="/source-policy" className="text-blue-600 underline">출처 기준</Link>과 <Link href="/correction-policy" className="text-blue-600 underline">정정 절차</Link>를 확인하고, 오류는 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>로 알려주세요.</p>
    </section>
    <Suspense fallback={<p className="max-w-content mx-auto px-6 py-6" role="status">검수한 신청 가이드를 확인하고 있습니다.</p>}><HomePublishedGuides /></Suspense>
    {ADSENSE_REVIEW_MODE && <Suspense fallback={<p className="max-w-content mx-auto px-6 py-10" role="status">지역 지도를 불러오는 중입니다.</p>}><RegionMap /></Suspense>}
    <Suspense fallback={null}><HomePublishedNews /></Suspense>
  </>;
}

/** 검수 자료 대기는 상단 안내와 지도의 표시를 막지 않습니다. */
export async function HomePublishedGuides() {
  const publishedGuides = await getGuides(50, { publicationOnly: true }).catch(() => null);
  const featuredSlugs = [
    "documents-before-government-benefit", "small-business-policy-fund-mistakes",
    "policy-duplicate-benefit-limits", "geunjang-earned-income-tax-credit-check",
    "youth-rent-checklist-2026",
  ];
  const cards = featuredSlugs.flatMap(slug => {
    const guide = publishedGuides?.find(item => item.slug === slug);
    const evidence = guide && getGuideEvidence(guide);
    return guide && evidence ? [{ guide, evidence }] : [];
  });
  return <>
    <section className="max-w-content mx-auto px-6 lg:px-10 py-12" aria-labelledby="first-guides">
      <h2 id="first-guides" className="text-2xl font-bold mb-6">신청 전에 자주 막히는 질문</h2>
      {!cards.length && <p className="mb-6 leading-relaxed text-grey-700">{publishedGuides ? "개별 검수를 마친 가이드만 소개합니다. 먼저 위 체크리스트와 담당 기관 공고를 확인하세요." : "가이드 목록을 잠시 불러오지 못했습니다. 위 체크리스트와 담당 기관의 공고를 먼저 확인하세요."}</p>}
      <div className="grid gap-4 md:grid-cols-2">{cards.map(({ guide, evidence }) => (
        <article key={guide.slug} className="p-6 rounded-2xl border border-grey-200">
          {evidence.status === "closed" && <p className="mb-2 text-sm font-semibold text-grey-700">해당 모집 마감 · 이전 회차 참고</p>}
          <h3 className="font-bold text-grey-900">{evidence.question}</h3>
          <p className="mt-2 leading-relaxed text-grey-700">{evidence.answer}</p>
          <p className="mt-3 text-sm text-grey-600">자료 확인: {evidence.sources[0].agency} · {evidence.sources[0].checkedAt}</p>
          <Link href={`/guides/${guide.slug}`} className="inline-block mt-3 text-blue-600 underline">{guide.title} →</Link>
        </article>
      ))}</div>
      <Link href="/guides" className="inline-block mt-6 text-blue-600 underline">검수한 가이드 전체 보기 →</Link>
    </section>
    <HomeTargetCards publishedSlugs={publishedGuides?.map(guide => guide.slug) ?? []} />
  </>;
}

// 새 뉴스 조회는 가이드와 지도의 표시를 기다리게 하지 않습니다.
async function HomePublishedNews() {
  const articles = await loadPublishedNews();
  if (!articles.length) return null;
  return <section className="max-w-content mx-auto px-6 lg:px-10 py-12" aria-labelledby="reviewed-news">
    <h2 id="reviewed-news" className="text-2xl font-bold mb-6">정책 변화, 무엇을 확인할까요?</h2>
    <EditorialNewsCards articles={articles.slice(0, 3)} />
    <Link href="/news" className="inline-block mt-6 text-blue-600 underline">정책뉴스 모두 보기 →</Link>
  </section>;
}
