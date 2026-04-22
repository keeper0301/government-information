import { SearchBox } from "@/components/search-box";
import { AlertStrip } from "@/components/alert-strip";
import { ProgramList } from "@/components/program-list";
import { CalendarPreview } from "@/components/calendar-preview";
import { FeatureGrid } from "@/components/feature-grid";
import { AdSlot } from "@/components/ad-slot";
import { HomeRecommendCard } from "@/components/home-recommend-card";
import { getTopWelfare, getTopLoans, getUrgentProgram } from "@/lib/programs";
import { createClient } from "@/lib/supabase/server";

// 홈페이지는 로그인 사용자·비로그인 사용자마다 프로필 자동 채움이 달라서
// ISR 대신 요청마다 렌더링 (매 요청 ~수십ms, 성능 영향 미미)
export const dynamic = "force-dynamic";

export default async function Home() {
  // 홈 데이터·로그인 사용자 프로필 병렬 조회
  const supabase = await createClient();
  const [welfare, loans, urgent, userResult] = await Promise.all([
    getTopWelfare(4),
    getTopLoans(3),
    getUrgentProgram(),
    supabase.auth.getUser(),
  ]);

  // 로그인 사용자면 프로필 추가 조회 (홈카드 자동 채움용)
  const user = userResult.data.user;
  let initialProfile: {
    age_group: string | null;
    region: string | null;
    occupation: string | null;
  } | null = null;
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

      {/* Alert */}
      <AlertStrip program={urgent} />

      {/* Welfare */}
      <div className="bg-grey-50">
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <ProgramList
            title="지금 신청 가능한 복지서비스"
            programs={welfare}
            moreHref="/welfare"
          />
        </section>
      </div>

      {/* Ad */}
      <AdSlot />

      {/* Loans */}
      <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
        <ProgramList
          title="소상공인 대출·지원금"
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

      {/* Features */}
      <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
        <FeatureGrid />
      </section>

      {/* Ad */}
      <AdSlot />
    </main>
  );
}
