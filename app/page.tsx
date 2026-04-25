import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { AlertStrip } from "@/components/alert-strip";
import { CalendarPreview } from "@/components/calendar-preview";
import { FeatureGrid } from "@/components/feature-grid";
import { HomeRecommendCard } from "@/components/home-recommend-card";
import { HomeRecommendAuto } from "@/components/home-recommend-auto";
import { EmptyProfilePrompt } from "@/components/personalization/EmptyProfilePrompt";
import { HeroStats } from "@/components/hero-stats";
import { RegionMap } from "@/components/region-map";
import { HomeCTA } from "@/components/home-cta";
import { FloatingWishWidget } from "@/components/wish-form-floating";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { BlogCard, type BlogCardData } from "@/components/blog-card";
import { NewsCard, type NewsCardData } from "@/components/news-card";
import { getUrgentPrograms, type ProfileLite } from "@/lib/programs";
import { getProgramCounts } from "@/lib/home-stats";
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

  // 2) 로그인 사용자면 프로필 조회 (HomeRecommendCard 자동 채움용)
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

  // 핵심 필드(나이대·지역·직업)가 하나도 없으면 "빈 프로필" 로 판단
  // load-profile.ts 의 isEmpty 와 같은 기준 — 비로그인 시 null 이므로 항상 true
  const isProfileEmpty =
    !initialProfile?.age_group &&
    !initialProfile?.region &&
    !initialProfile?.occupation;

  // 3) 최근 블로그 3글 + 최근 뉴스 3건 + 통합 stats RPC (병렬).
  //    이전엔 4 count query 직접 호출 → 단일 RPC 통합 (lib/home-stats).
  //    react cache 로 HeroStats 와 같은 RPC 결과 공유 → 1 RPC 만 실행.
  const [recentPostsResult, recentNewsResult, programCounts] = await Promise.all([
    supabase
      .from("blog_posts")
      .select(
        "slug, title, meta_description, category, reading_time_min, published_at, cover_image",
      )
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(3),
    // 최근 정책 소식 3건 — 전체 카테고리(news/press/policy-doc) 최신순.
    supabase
      .from("news_posts")
      .select(
        "slug, title, summary, category, ministry, thumbnail_url, published_at",
      )
      .order("published_at", { ascending: false })
      .limit(3),
    getProgramCounts(),
  ]);
  const recentPosts: BlogCardData[] = (recentPostsResult.data ?? []) as BlogCardData[];
  const recentNews: NewsCardData[] = (recentNewsResult.data ?? []) as NewsCardData[];

  const todayNew = programCounts.today_new_welfare + programCounts.today_new_loan;
  const weekNew = programCounts.week_new_welfare + programCounts.week_new_loan;
  // Hero 인디케이터 메시지 — 오늘 데이터 있으면 오늘, 없으면 이번 주, 둘 다 0이면 정적
  const heroIndicator =
    todayNew > 0
      ? `오늘 ${todayNew.toLocaleString()}건 새 공고 추가됐어요`
      : weekNew > 0
      ? `이번 주 ${weekNew.toLocaleString()}건 새 공고 등록`
      : "실시간 공공데이터 연동";

  return (
    <main>
      {/* Hero — 데스크톱에서 좌: 카피·검색 / 우: 맞춤 추천 카드 (1024px 이상에서 2단)
          section 자체는 viewport 풀폭으로 두고 inner div 에서 max-w-content 적용.
          이래야 배경 blob 이 좌우 끝까지 펼쳐져서 가장자리 흰색 띠가 안 생김. */}
      <section
        className="relative overflow-hidden pt-40 pb-[100px] max-md:pt-[120px] max-md:pb-[60px]"
        style={{
          // 토스 blue-50 (#E8F3FF) 베이스 + 가운데 위쪽에 흰색 spotlight.
          // 가장자리(좌·우·아래) 까지 옅은 blue 가 자연스럽게 흐르고,
          // content 가운데는 흰색에 가까워 텍스트 가독성 유지.
          background:
            "radial-gradient(ellipse 90% 80% at 50% 25%, #FFFFFF 0%, #F0F7FF 55%, #E8F3FF 100%)",
        }}
      >
        {/* 배경 blob — 옅은 blue gradient 두 개가 천천히 떠다니며 활동감.
            section 풀폭 안에서 absolute pointer-events-none 으로 시각 효과만. */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="hero-blob hero-blob--a" />
          <div className="hero-blob hero-blob--b" />
        </div>

        {/* 안쪽 max-w-content — content 가운데 정렬 (1140px). z-10 으로 blob 위. */}
        <div className="relative z-10 max-w-content mx-auto px-10 max-md:px-6 grid gap-10 items-start lg:grid-cols-[1.15fr_1fr]">
          {/* 왼쪽: 카피 + 검색 — fade-up stagger 60ms 간격으로 위에서 아래로
              자연스럽게 등장. animationDelay 는 inline style 로 정확 제어. */}
          <div>
            <div
              className="fade-up inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 mb-6 before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-blue-500 before:opacity-[0.55]"
              style={{ animationDelay: "0ms" }}
            >
              {heroIndicator}
            </div>
            <h1
              className="fade-up text-[48px] font-extrabold leading-[1.25] tracking-[-2px] text-grey-900 mb-5 max-md:text-[32px] max-md:tracking-[-1.2px]"
              style={{ animationDelay: "60ms" }}
            >
              숨겨진 정부 혜택,
              <br />
              30초 만에 찾아드릴게요
            </h1>
            <p
              className="fade-up text-[17px] leading-[1.65] text-grey-600 max-w-[500px] tracking-[-0.3px] mb-10 max-md:text-[15px]"
              style={{ animationDelay: "120ms" }}
            >
              복지로·소상공인24·금융위원회 데이터를
              <br />
              매일 자동으로 모아드려요.
            </p>
            <div className="fade-up" style={{ animationDelay: "180ms" }}>
              <SearchBox />
            </div>
          </div>

          {/* 오른쪽: 맞춤 추천 카드 (데스크톱 전용 위치. 모바일에선 아래로 자연스럽게 스택)
              3가지 상태 분기:
              - 비로그인: 기존 HomeRecommendCard 입력 폼
              - 로그인 + 빈 프로필: EmptyProfilePrompt 프로필 입력 유도
              - 로그인 + 프로필 있음: HomeRecommendAuto 자동 추천 카드 */}
          <div className="fade-up lg:mt-14" style={{ animationDelay: "240ms" }}>
            {user ? (
              isProfileEmpty ? (
                // 로그인했지만 프로필 미입력 — 프로필 작성 유도 메시지
                <EmptyProfilePrompt />
              ) : (
                // 로그인 + 프로필 있음 — 자동 추천 카드 (server component)
                <HomeRecommendAuto />
              )
            ) : (
              // 비로그인 — 기존 입력 폼 그대로 (변화 없음)
              <HomeRecommendCard initial={initialProfile} />
            )}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          내러티브 4단계: 문제(Hero 카피) → 해결(Hero+RecommendCard) →
          증거(Stats+Map) → 도구(Calendar+Alert+Blog+News) → 방법(Features) →
          행동(HomeCTA). 토스 "방문자 사로잡기" 전략 적용.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

      {/* [증거 1] HeroStats — 누적 정책뉴스·진행 공고·데이터 출처 큰 숫자 + 카운트업 */}
      <RevealOnScroll>
        <HeroStats />
      </RevealOnScroll>

      {/* [증거 2] RegionMap — 지역별 진행 중 정책 수 시각화 (한국 지도 풍 grid) */}
      <RevealOnScroll>
        <RegionMap />
      </RevealOnScroll>

      {/* [도구 1] Calendar — 이번 달 신청 일정 달력 */}
      <RevealOnScroll>
        <div className="bg-grey-50">
          <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
            <CalendarPreview />
          </section>
        </div>
      </RevealOnScroll>

      {/* [도구 2] Alert — 마감 임박 마퀴 (달력에서 전체 → 그 중 지금 당장 액션 필요) */}
      <RevealOnScroll>
        <AlertStrip programs={urgents} isLoggedIn={!!user} />
      </RevealOnScroll>

      {/* [도구 3] Blog — 정책 가이드 (자체 콘텐츠) */}
      {recentPosts.length > 0 && (
        <RevealOnScroll>
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
        </RevealOnScroll>
      )}

      {/* [도구 4] News — 외부 정책 발표 큐레이션 (korea.kr 출처) */}
      {recentNews.length > 0 && (
        <RevealOnScroll>
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
        </RevealOnScroll>
      )}

      {/* [방법] FeatureGrid — 어떻게 작동? 3 STEPS (조건 입력 → 마감 알림 → 챗봇 안내) */}
      <RevealOnScroll>
        <div className="bg-grey-50">
          <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
            <FeatureGrid />
          </section>
        </div>
      </RevealOnScroll>

      {/* [참여] WishForm — 좌측 하단 floating 위젯으로 분리.
          본문 섹션 차지 안 하고, 챗봇(우측 하단) 과 충돌 없이 좌측에 떠 있음.
          닫기·24시간 숨기기 지원. */}
      <FloatingWishWidget />

      {/* [행동] HomeCTA — 사용자가 가져갈 다음 행동 (추천 받기 + 알림 받기) */}
      <RevealOnScroll>
        <HomeCTA />
      </RevealOnScroll>
    </main>
  );
}
