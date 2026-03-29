import { SearchBox } from "@/components/search-box";
import { AlertStrip } from "@/components/alert-strip";
import { ProgramList } from "@/components/program-list";
import { CalendarPreview } from "@/components/calendar-preview";
import { FeatureGrid } from "@/components/feature-grid";
import { AdSlot } from "@/components/ad-slot";
import { getTopWelfare, getTopLoans, getUrgentProgram } from "@/lib/programs";

export const revalidate = 600; // ISR: 10분마다 갱신

export default async function Home() {
  const [welfare, loans, urgent] = await Promise.all([
    getTopWelfare(4),
    getTopLoans(3),
    getUrgentProgram(),
  ]);

  return (
    <main>
      {/* Hero */}
      <section className="pt-40 pb-[100px] px-10 max-w-content mx-auto max-md:pt-[120px] max-md:pb-[60px] max-md:px-6">
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
