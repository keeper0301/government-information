import Link from "next/link";
// next/dynamic 을 nextDynamic 으로 alias — 페이지 하단의
// `export const dynamic = "force-dynamic"` (Next.js segment config) 와 이름 충돌 방지.
import nextDynamic from "next/dynamic";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { AlertStrip } from "@/components/alert-strip";
import { CalendarPreview } from "@/components/calendar-preview";
import { FeatureGrid } from "@/components/feature-grid";
import { QuizInlineWizard } from "@/components/quiz-inline-wizard";
import { HomeDiscoveryHub } from "@/components/home-discovery-hub";
import { HomeTrustStrip } from "@/components/home-trust-strip";
import { HomeRecommendAuto } from "@/components/home-recommend-auto";
import { HomeValueProps } from "@/components/home-value-props";
import { HomePopularPicks } from "@/components/home-popular-picks";
import { HomeJsonLd } from "@/components/home-jsonld";
import { AdSlot } from "@/components/ad-slot";
import { BlogCategoryChips } from "@/components/blog-category-chips";
import { EmptyProfilePrompt } from "@/components/personalization/EmptyProfilePrompt";
import { EnhanceProfileBanner } from "@/components/personalization/EnhanceProfileBanner";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { HeroStats } from "@/components/hero-stats";
import { RegionMap } from "@/components/region-map";
import { HomeCTA } from "@/components/home-cta";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { BlogCard, type BlogCardData } from "@/components/blog-card";
import { NewsCard, type NewsCardData } from "@/components/news-card";
import { getUrgentPrograms } from "@/lib/programs";
import { getProgramCounts } from "@/lib/home-stats";
import { getDataFreshness, formatFreshness } from "@/lib/data-freshness";
import { createClient } from "@/lib/supabase/server";

// FloatingWishWidget — 좌측 하단 floating 위젯, 즉시 노출 불필요.
// nextDynamic 으로 청크 분리 → 메인 번들 가벼움.
const FloatingWishWidget = nextDynamic(
  () =>
    import("@/components/wish-form-floating").then((m) => ({
      default: m.FloatingWishWidget,
    })),
  { loading: () => null },
);

// 홈페이지는 로그인 사용자·비로그인 사용자마다 프로필 자동 채움이 달라서
// ISR 대신 요청마다 렌더링 (매 요청 ~수십ms, 성능 영향 미미)
export const dynamic = "force-dynamic";

async function HeroIndicator() {
  const [programCountsResult, freshnessResult] = await Promise.allSettled([
    getProgramCounts(),
    getDataFreshness(),
  ]);
  const programCounts =
    programCountsResult.status === "fulfilled"
      ? programCountsResult.value
      : {
          today_new_welfare: 0,
          today_new_loan: 0,
          week_new_welfare: 0,
          week_new_loan: 0,
        };
  const freshness =
    freshnessResult.status === "fulfilled" ? freshnessResult.value : null;
  const todayNew = programCounts.today_new_welfare + programCounts.today_new_loan;
  const weekNew = programCounts.week_new_welfare + programCounts.week_new_loan;
  const heroIndicator =
    todayNew > 0
      ? `오늘 ${todayNew.toLocaleString()}건 새 공고 추가됐어요`
      : weekNew > 0
      ? `이번 주 ${weekNew.toLocaleString()}건 새 공고 등록`
      : "실시간 공공데이터 연동";
  const freshnessSuffix =
    freshness?.minutes_ago !== null &&
    freshness?.minutes_ago !== undefined &&
    freshness.minutes_ago < 24 * 60
      ? formatFreshness(freshness.minutes_ago)
      : null;

  return (
    <>
      <span>{heroIndicator}</span>
      {freshnessSuffix && (
        <span className="text-grey-500 font-normal hidden sm:inline">
          · {freshnessSuffix}
        </span>
      )}
    </>
  );
}

async function AlertStripSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const urgents = await getUrgentPrograms(12);
  return <AlertStrip programs={urgents} isLoggedIn={isLoggedIn} />;
}

async function RecentBlogSection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_posts")
    .select(
      "slug, title, meta_description, category, reading_time_min, published_at, cover_image",
    )
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(3);
  const recentPosts: BlogCardData[] = (data ?? []) as BlogCardData[];

  if (recentPosts.length === 0) return null;

  return (
    <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 tracking-[-0.5px]">
          정책 블로그
        </h2>
        <Link
          href="/blog"
          className="text-[14px] font-semibold text-blue-500 hover:text-blue-600 no-underline"
        >
          전체 보기 →
        </Link>
      </div>
      {/* 카테고리 chip 7종 — /blog/category long-tail SEO 동선 (87efc65 연계) */}
      <BlogCategoryChips />
      <div className="grid gap-5 md:grid-cols-3">
        {recentPosts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}

async function RecentNewsSection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_posts")
    .select(
      "slug, title, summary, category, ministry, source_outlet, thumbnail_url, published_at",
    )
    .order("published_at", { ascending: false })
    .limit(3);
  const recentNews: NewsCardData[] = (data ?? []) as NewsCardData[];

  if (recentNews.length === 0) return null;

  return (
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
  );
}

export default async function Home() {
  // 1) 첫 화면 사용자 분기에 필요한 인증/프로필만 먼저 확보.
  //    아래쪽 콘텐츠 데이터는 각 Suspense 섹션 안에서 별도 스트리밍.
  const fullProfile = await loadUserProfile();
  const isLoggedIn = fullProfile !== null;

  // 2) 로그인 사용자면 cached 프로필 조회 결과로 빈 프로필 여부와 Phase 1.5 배너를 함께 판단.
  const isProfileEmpty = !fullProfile || fullProfile.isEmpty;

  // Phase 1.5 자격 정보 입력 유도 배너 노출 조건:
  // 로그인 + 온보딩 거침 + income/household 둘 다 미입력 → Phase 1.5 효과 0 인 사용자
  // (온보딩 안 거친 사용자는 EmptyProfilePrompt 가 처리)
  const showEnhanceBanner = Boolean(
    fullProfile?.hasProfile &&
      fullProfile.dismissedOnboardingAt !== null &&
      !fullProfile.signals.incomeLevel &&
      fullProfile.signals.householdTypes.length === 0,
  );

  return (
    <main>
      {/* SEO 리치 카드 — BreadcrumbList + FAQPage (Google "사이트에서 묻는 질문" 펼침 카드 후보).
          홈 페이지 한 번만 출력, 다른 페이지는 각자 페이지 단위 JSON-LD. */}
      <HomeJsonLd />
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
              <Suspense fallback={<span>실시간 공공데이터 연동</span>}>
                <HeroIndicator />
              </Suspense>
            </div>
            <h1
              className="fade-up text-[48px] font-extrabold leading-[1.25] tracking-[-2px] text-grey-900 mb-5 max-md:text-[32px] max-md:tracking-[-1.2px]"
              style={{ animationDelay: "60ms" }}
            >
              내 조건에 맞는 정책만
              <br />
              먼저 보여드릴게요
            </h1>
            <p
              className="fade-up text-[17px] leading-[1.65] text-grey-600 max-w-[500px] tracking-[-0.3px] mb-6 max-md:text-[15px]"
              style={{ animationDelay: "120ms" }}
            >
              지역·소득·가구·직업 정보를 기준으로 맞지 않는 정책은 줄이고,
              <br />
              마감 전에 확인해야 할 지원사업을 먼저 보여드려요.
            </p>
            {/* [발견] 회원가입 가치 카드 3종 — 24h 가입 0건 직격타 (2026-04-28).
                Hero 카피 바로 아래 inline chip 으로 가치 명시. */}
            <div className="fade-up" style={{ animationDelay: "150ms" }}>
              <HomeValueProps />
            </div>
            {/* 메인 CTA — 외부 LLM 평가 후속 (2026-04-28).
                "1분 진단" 단일 메인 + SearchBox 보조. /quiz 가 익명 5문항 진단 */}
            <div
              className="fade-up flex items-center gap-3 mb-6 max-md:flex-col max-md:items-stretch"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                href={isLoggedIn ? (isProfileEmpty ? "/mypage" : "/recommend") : "/quiz"}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-blue-500 text-white text-[15px] font-bold hover:bg-blue-600 transition-colors no-underline shadow-[0_4px_12px_rgba(49,130,246,0.25)] min-h-[48px]"
              >
                {isLoggedIn ? (isProfileEmpty ? "마이페이지 보완하기" : "내 맞춤 정책 전체 보기") : "내 정책 1분 진단"}
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/welfare"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white text-grey-900 text-[15px] font-semibold hover:bg-grey-50 transition-colors no-underline border border-grey-200 min-h-[48px]"
              >
                정책 둘러보기
              </Link>
            </div>
            <div className="fade-up" style={{ animationDelay: "240ms" }}>
              <SearchBox />
            </div>
          </div>

          {/* 오른쪽: 맞춤 추천 카드 (데스크톱 전용 위치. 모바일에선 아래로 자연 스택)
              3가지 상태 분기:
              - 비로그인: HomeRecommendCard 입력 폼
              - 로그인 + 빈 프로필: EmptyProfilePrompt 프로필 입력 유도
              - 로그인 + 프로필 있음: HomeRecommendAuto 자동 추천 카드
              인기 정책 TOP 5 는 viewport 1500px+ 에서 fixed sticky sidebar 로 이동. */}
          <div className="fade-up lg:mt-14" style={{ animationDelay: "240ms" }}>
            {isLoggedIn ? (
              isProfileEmpty ? (
                // 로그인했지만 프로필 미입력 — 프로필 작성 유도 메시지
                <EmptyProfilePrompt />
              ) : (
                // 로그인 + 프로필 있음 — 자동 추천 카드 (server component)
                <HomeRecommendAuto profile={fullProfile} />
              )
            ) : (
              // 비로그인 — AI 진단 wizard (Phase 3, 5문항 익명, 가입 funnel)
              <QuizInlineWizard />
            )}
          </div>
        </div>
      </section>

      {/* 인기 정책 TOP 5 — viewport 1800px+ fixed sticky sidebar.
          큰 모니터 우측 빈 공간 (max-w-content 1140px 외부) 활용.
          breakpoint 1800px 계산:
            - main 우측 끝 = vw/2 + 570 (max-w-content centered)
            - sidebar 좌측 끝 = vw - 24 - 300 = vw - 324
            - overlap 조건: (vw - 324) < (vw/2 + 570) → vw < 1788
            → 1800px 안전 round. FHD 1920px 이상 노출. */}
      <div
        className="hidden min-[1800px]:block fixed top-[120px] right-6 w-[300px] z-30 max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-hidden"
        aria-label="인기 정책 사이드 배너"
      >
        <Suspense fallback={null}>
          <HomePopularPicks isLoggedIn={isLoggedIn} />
        </Suspense>
      </div>

      <HomeDiscoveryHub
        regionMap={<RegionMap />}
      />

      <RevealOnScroll>
        <Suspense fallback={<div className="h-[150px]" aria-hidden />}>
          <HomeTrustStrip />
        </Suspense>
      </RevealOnScroll>

      {/* Phase 1.5 자격 정보 입력 유도 — income/household 미입력 사용자에게만.
          24h dismiss 가능 (localStorage). hero 와 narrative 사이라 자연스러운 nudge */}
      {showEnhanceBanner && <EnhanceProfileBanner />}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          내러티브 4단계: 문제(Hero 카피) → 해결(Hero+RecommendCard) →
          탐색(Hub) → 증거(Stats) → 도구(Calendar+Blog+News) → 방법(Features) →
          행동(HomeCTA). 토스 "방문자 사로잡기" 전략 적용.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

      {/* below-the-fold 섹션 — Suspense streaming.
          server component 들의 fetch 가 끝날 때까지 placeholder 노출 →
          HTML chunk 단위로 streaming → 첫 chunk(above-the-fold) 가 빨리 도착.
          placeholder 높이는 실제 컴포넌트 평균 높이로 맞춰 CLS 회귀 방지. */}

      {/* [증거 1] HeroStats — 누적 정책뉴스·진행 공고·데이터 출처 큰 숫자 + 카운트업 */}
      <RevealOnScroll>
        <Suspense fallback={<div className="h-[280px]" aria-hidden />}>
          <HeroStats />
        </Suspense>
      </RevealOnScroll>

      {/* [도구 1] Calendar — 이번 달 신청 일정 달력 */}
      <RevealOnScroll>
        <Suspense fallback={<div className="h-[480px] bg-grey-50" aria-hidden />}>
          <div className="bg-grey-50">
            <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
              <CalendarPreview />
            </section>
          </div>
        </Suspense>
      </RevealOnScroll>

      <RevealOnScroll>
        <Suspense fallback={<div className="h-[60px]" aria-hidden />}>
          <AlertStripSection isLoggedIn={isLoggedIn} />
        </Suspense>
      </RevealOnScroll>

      {/* [E2 광고] AdSense in-feed — 인기 정책 다음, Blog 섹션 앞.
          홈 above-the-fold 와 Hero 침범 없고, "콘텐츠 사이" 자연 위치 (CLS 안전).
          env 미설정 시 자동으로 옅은 placeholder 만 렌더. */}
      <AdSlot />

      {/* [도구 3] Blog — 정책 블로그 (자체 콘텐츠) */}
      <RevealOnScroll>
        <Suspense fallback={<div className="h-[420px]" aria-hidden />}>
          <RecentBlogSection />
        </Suspense>
      </RevealOnScroll>

      {/* [도구 4] News — 외부 정책 발표 큐레이션 (korea.kr 출처) */}
      <RevealOnScroll>
        <Suspense fallback={<div className="h-[420px]" aria-hidden />}>
          <RecentNewsSection />
        </Suspense>
      </RevealOnScroll>

      {/* [방법] FeatureGrid — 어떻게 작동? 3 STEPS (조건 입력 → 마감 알림 → 챗봇 안내) */}
      <RevealOnScroll>
        <Suspense fallback={<div className="h-[400px] bg-grey-50" aria-hidden />}>
          <div className="bg-grey-50">
            <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
              <FeatureGrid />
            </section>
          </div>
        </Suspense>
      </RevealOnScroll>

      {/* [참여] WishForm — 좌측 하단 floating 위젯으로 분리.
          본문 섹션 차지 안 하고, 챗봇(우측 하단) 과 충돌 없이 좌측에 떠 있음.
          닫기·24시간 숨기기 지원. */}
      <FloatingWishWidget />

      {/* [행동] HomeCTA — 사용자가 가져갈 다음 행동 (추천 받기 + 알림 받기) */}
      <RevealOnScroll>
        <Suspense fallback={<div className="h-[280px]" aria-hidden />}>
          <HomeCTA />
        </Suspense>
      </RevealOnScroll>
    </main>
  );
}
