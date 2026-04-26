import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getRecommendations,
  getRelatedNews,
  getRelatedBlogs,
  PROGRAM_TYPES,
  type ProgramType,
} from "@/lib/recommend";
import { AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS } from "@/lib/profile-options";
import type {
  AgeOption,
  RegionOption,
  OccupationOption,
} from "@/lib/profile-options";
import type { DisplayProgram } from "@/lib/programs";
import { RecommendForm } from "./form";
import { NewsCard, type NewsCardData } from "@/components/news-card";
import { BlogCard, type BlogCardData } from "@/components/blog-card";
import { loadUserProfile } from "@/lib/personalization/load-profile";

export const metadata: Metadata = {
  title: "맞춤추천 — 정책알리미",
  description: "나이, 지역, 직업에 맞는 복지·대출 정책을 추천받으세요.",
};

type SearchParams = {
  age?: string;
  region?: string;
  district?: string;
  occupation?: string;
  type?: string;
};

// 맞춤추천 페이지 (서버 컴포넌트)
// 입력 우선순위:
//   1) URL 쿼리 (?age=30대&region=전남&occupation=자영업자&type=welfare)
//      → 홈의 HomeRecommendCard 에서 조건을 URL 로 넘긴 경우
//   2) 로그인한 사용자의 /mypage 프로필
// 3필드 모두 유효하면 서버에서 getRecommendations 를 즉시 호출해
// 페이지 로드 직후 결과가 보이게 한다 (SSR, JS-less 첫 화면 완성)
export default async function RecommendPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 시 프로필 + 자영업자 자격(businessProfile) 동시 조회.
  // loadUserProfile() 은 React cache 라 같은 요청 내 중복 호출 비용 0.
  // user_profiles + business_profiles 1 RTT 로 받아 RecommendForm 에 drilling.
  const fullProfile = user ? await loadUserProfile() : null;
  const profile = fullProfile?.hasProfile
    ? {
        age_group: fullProfile.signals.ageGroup,
        region: fullProfile.signals.region,
        district: fullProfile.signals.district,
        occupation: fullProfile.signals.occupation,
      }
    : null;
  const businessProfile = fullProfile?.signals.businessProfile ?? null;

  // URL 쿼리 우선, 없으면 프로필 값
  const candidateAge = params.age ?? profile?.age_group ?? null;
  const candidateRegion = params.region ?? profile?.region ?? null;
  const candidateDistrict = params.district ?? profile?.district ?? null;
  const candidateOcc = params.occupation ?? profile?.occupation ?? null;

  // programType 파싱 — 잘못된 값은 "all" 로 폴백
  let candidateType: ProgramType = "all";
  if (params.type && (PROGRAM_TYPES as readonly string[]).includes(params.type)) {
    candidateType = params.type as ProgramType;
  }

  // 폼 초기값 (유효성 검사 전 값 그대로 — 폼에서 pickMatching 으로 한 번 더 필터됨)
  const initial = {
    age_group: candidateAge,
    region: candidateRegion,
    district: candidateDistrict,
    occupation: candidateOcc,
    program_type: candidateType,
  };

  // 3필드가 모두 옵션 목록에 포함된 유효한 값일 때만 SSR 추천 실행
  const isValidAge = candidateAge
    ? (AGE_OPTIONS as readonly string[]).includes(candidateAge)
    : false;
  const isValidRegion = candidateRegion
    ? (REGION_OPTIONS as readonly string[]).includes(candidateRegion)
    : false;
  const isValidOcc = candidateOcc
    ? (OCCUPATION_OPTIONS as readonly string[]).includes(candidateOcc)
    : false;

  let initialPrograms: DisplayProgram[] | null = null;
  let relatedNews: NewsCardData[] = [];
  let relatedBlogs: BlogCardData[] = [];

  if (isValidAge && isValidRegion && isValidOcc) {
    // 3 함수 모두 Supabase 라운드트립 → Promise.all 로 직렬 대기 절약
    const [programs, news, blogs] = await Promise.all([
      getRecommendations({
        ageGroup: candidateAge as AgeOption,
        region: candidateRegion as RegionOption,
        district: candidateDistrict,
        occupation: candidateOcc as OccupationOption,
        programType: candidateType,
      }),
      getRelatedNews({
        age: candidateAge as AgeOption,
        occupation: candidateOcc as OccupationOption,
      }),
      getRelatedBlogs({
        age: candidateAge as AgeOption,
        occupation: candidateOcc as OccupationOption,
      }),
    ]);
    initialPrograms = programs;
    relatedNews = news;
    relatedBlogs = blogs;
  }

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        맞춤추천
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        나의 조건에 맞는 정책을 찾아드립니다
      </p>

      <RecommendForm
        initial={initial}
        initialPrograms={initialPrograms}
        businessProfile={businessProfile}
      />

      {/* 관련 뉴스 — 사용자 조건에 맞는 BENEFIT_TAGS overlap 매칭 */}
      {relatedNews.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold text-grey-900 mb-4">
            관련 정책 뉴스
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {relatedNews.map((post) => (
              <NewsCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* 함께 보면 좋은 가이드 — blog 인구통계 카테고리 매칭 */}
      {relatedBlogs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold text-grey-900 mb-4">
            함께 보면 좋은 가이드
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {relatedBlogs.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
