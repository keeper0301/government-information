import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { AlertStrip } from "@/components/alert-strip";
import { ProgramList } from "@/components/program-list";
import { CalendarPreview } from "@/components/calendar-preview";
import { FeatureGrid } from "@/components/feature-grid";
import { AdSlot } from "@/components/ad-slot";
import { HomeRecommendCard } from "@/components/home-recommend-card";
import { BlogCard, type BlogCardData } from "@/components/blog-card";
import { NewsCard, type NewsCardData } from "@/components/news-card";
import {
  getTopWelfare,
  getTopLoans,
  getUrgentPrograms,
  type ProfileLite,
} from "@/lib/programs";
import { getRecommendations } from "@/lib/recommend";
import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from "@/lib/profile-options";
import { createClient } from "@/lib/supabase/server";

// 홈페이지는 로그인 사용자·비로그인 사용자마다 프로필 자동 채움이 달라서
// ISR 대신 요청마다 렌더링 (매 요청 ~수십ms, 성능 영향 미미)
export const dynamic = "force-dynamic";

export default async function Home() {
  // 1) 로그인 상태 + urgent 리스트 먼저 확보 (이 둘은 프로필 유무와 무관)
  const supabase = await createClient();
  const [urgents, userResult] = await Promise.all([
    getUrgentPrograms(30),
    supabase.auth.getUser(),
  ]);

  // 2) 로그인 사용자면 프로필 조회 (홈카드 + 개인화 섹션 둘 다에 사용)
  const user = userResult.data.user;
  let initialProfile: ProfileLite | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("age_group, region, occupation")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) {
      initialProfile = {
        age_group: profile.age_group ?? null,
        region: profile.region ?? null,
        occupation: profile.occupation ?? null,
      };
    }
  }

  // 3) 프로필 3필드 중 하나라도 있으면 개인화 모드
  const hasProfile = !!(
    initialProfile &&
    (initialProfile.age_group || initialProfile.region || initialProfile.occupation)
  );

  // 4) 복지·대출 목록: 개인화 vs 일반 분기 + 최근 블로그 3글 + 최근 뉴스 3건 (병렬)
  //
  // 개인화 모드는 /recommend 페이지와 동일한 getRecommendations 를 재사용 —
  // REGION_ALIASES + 제목 prefix + 직업 필수 매칭으로 일관성 보장.
  // 이전엔 lib/programs.ts 의 getPersonalized* 가 지역 필터조차 없어 전남 사용자에게
  // 광주·서울·대전·부산 공고가 뜨는 회귀 발생 → 여기서 하나로 통일.
  // ProfileLite 필드가 null 이면 /recommend 와 같은 기본값(전국·기타)로 fallback.
  const recParams = initialProfile && {
    ageGroup: (initialProfile.age_group ?? "30대") as AgeOption,
    region: (initialProfile.region ?? "전국") as RegionOption,
    occupation: (initialProfile.occupation ?? "기타") as OccupationOption,
  };

  const [welfare, loans, recentPostsResult, recentNewsResult] = await Promise.all([
    hasProfile && recParams
      ? getRecommendations({ ...recParams, programType: "welfare", limit: 4 })
      : getTopWelfare(4),
    hasProfile && recParams
      ? getRecommendations({ ...recParams, programType: "loan", limit: 3 })
      : getTopLoans(3),
    supabase
      .from("blog_posts")
      .select(
        "slug, title, meta_description, category, reading_time_min, published_at, cover_image",
      )
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(3),
    // 최근 정책 소식 3건 — 전체 카테고리(news/press/policy-doc) 최신순.
    // 홈은 첫 인상이므로 키워드 필터 없이 최신만 노출 — /news 페이지에서 카테고리 탭으로 탐색.
    supabase
      .from("news_posts")
      .select(
        "slug, title, summary, category, ministry, thumbnail_url, published_at",
      )
      .order("published_at", { ascending: false })
      .limit(3),
  ]);
  const recentPosts: BlogCardData[] = (recentPostsResult.data ?? []) as BlogCardData[];
  const recentNews: NewsCardData[] = (recentNewsResult.data ?? []) as NewsCardData[];

  // 5) 섹션 제목도 상태에 따라 변경 (개인화 모드 사용자에게 명확히 인식시킴)
  const welfareTitle = hasProfile ? "나에게 맞는 복지 서비스" : "지금 신청 가능한 복지서비스";
  const loanTitle = hasProfile ? "나에게 맞는 대출·지원금" : "소상공인 대출·지원금";

  return (
    <main>
      {/* Hero — 데스크톱에서 좌: 카피·검색 / 우: 맞춤 추천 카드 (1024px 이상에서 2단) */}
      <section className="pt-40 pb-[100px] px-10 max-w-content mx-auto max-md:pt-[120px] max-md:pb-[60px] max-md:px-6">
        <div className="grid gap-10 items-start lg:grid-cols-[1.15fr_1fr]">
          {/* 왼쪽: 카피 + 검색 */}
          <div>
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 mb-6 before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-blue-500 before:opacity-[0.55]">
              실시간 공공데이터 연동
            </div>
            <h1 className="text-[48px] font-bold leading-[1.3] tracking-[-1.8px] text-grey-900 mb-5 max-md:text-[32px] max-md:tracking-[-1.2px]">
              받을 수 있는 혜택,
              <br />
              놓치고 있지 않나요
            </h1>
            <p className="text-lg leading-[1.7] text-grey-600 max-w-[480px] tracking-[-0.2px] mb-10 max-md:text-base">
              복지로·소상공인24·금융위원회 데이터를 한곳에 모았습니다.
              <br />
              30초 만에 나에게 맞는 지원사업을 찾아보세요.
            </p>
            <SearchBox />
          </div>

          {/* 오른쪽: 맞춤 추천 카드 (데스크톱 전용 위치. 모바일에선 아래로 자연스럽게 스택) */}
          <div className="lg:mt-14">
            <HomeRecommendCard initial={initialProfile} />
          </div>
        </div>
      </section>

      {/* Welfare — 프로필 있으면 개인화 매칭 결과, 없으면 일반 */}
      <div className="bg-grey-50">
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <ProgramList
            title={welfareTitle}
            programs={welfare}
            moreHref="/welfare"
          />
        </section>
      </div>

      {/* Ad */}
      <AdSlot />

      {/* Loans — 프로필 있으면 개인화, 없으면 일반 */}
      <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
        <ProgramList
          title={loanTitle}
          programs={loans}
          moreHref="/loan"
        />
      </section>

      {/* Calendar */}
      <div className="bg-grey-50">
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <CalendarPreview />
        </section>
      </div>

      {/* Alert — 달력 바로 아래에 배치.
          의도: 달력에서 전체 일정을 훑은 뒤 "그 중 지금 당장 마감 임박한 것" 리마인더로
          자연스럽게 연결. 기존 Hero 바로 밑(상단) 위치는 첫인상이 긴급·자극적이었음. */}
      <AlertStrip programs={urgents} isLoggedIn={!!user} />

      {/* Blog — 최근 가이드 글 (0건이면 숨김) */}
      {recentPosts.length > 0 && (
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 tracking-[-0.5px]">
              정책 가이드 블로그
            </h2>
            <Link
              href="/blog"
              className="text-[14px] font-semibold text-blue-500 hover:text-blue-600 no-underline"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {recentPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* News — 최근 정책 소식 (korea.kr 큐레이션, 수집 0건이면 숨김).
          의도: 블로그(자체 가이드) → 뉴스(외부 정책 발표) 순으로 자연스러운
          정보 소비 흐름. 뉴스는 발표 → 공고화 순서의 앞쪽을 담당. */}
      {recentNews.length > 0 && (
        <div className="bg-grey-50">
          <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
            <div className="flex items-baseline justify-between mb-8">
              <h2 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 tracking-[-0.5px]">
                최근 정책 소식
              </h2>
              <Link
                href="/news"
                className="text-[14px] font-semibold text-blue-500 hover:text-blue-600 no-underline"
              >
                전체 보기 →
              </Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {recentNews.map((post) => (
                <NewsCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Features */}
      <div className="bg-grey-50">
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <FeatureGrid />
        </section>
      </div>

      {/* Ad */}
      <AdSlot />
    </main>
  );
}
