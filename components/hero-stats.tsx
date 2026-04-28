// ============================================================
// HeroStats — Hero 영역 아래 "수의 힘" 통계 띠 (토스 전략)
// ============================================================
// 토스 전략: 첫 화면에 강력한 비주얼 = 수가 많거나·움직이거나·호기심.
// keepioo 의 강점인 누적 데이터 (정책 뉴스·진행 공고·정부 출처) 를
// 큰 숫자로 노출 + 카운트업 애니메이션으로 활동감.
//
// 데이터: lib/home-stats 의 getProgramCounts() 사용. react cache 로
// 같은 요청 안의 다른 호출자(page.tsx Hero indicator 등) 와 RPC 1회 공유.
// ============================================================

import { CountUp } from "./count-up";
import { getProgramCounts } from "@/lib/home-stats";

// 광역 시·도 17개 (region 페이지 17 광역 동일) — 커버리지 시그널
const PROVINCE_COUNT = 17;
// 정부 데이터 출처 — footer 와 동일 6개 정적
const SOURCE_COUNT = 6;

export async function HeroStats() {
  const counts = await getProgramCounts();
  const totalPrograms = counts.welfare_total + counts.loan_total;

  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-12 max-md:py-8">
      {/* 4 카드 — 데이터 신뢰 시그널. 사용자 카운트는 의도적으로 제외
          (활성 사용자 부족 단계라 노출 시 신뢰 ↓ 위험. 데이터·커버리지 강조). */}
      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2 max-md:gap-3 bg-white rounded-3xl shadow-sm px-8 py-8 max-md:px-5 max-md:py-6">
        <Stat to={counts.news_total} label="정책 뉴스 큐레이션" />
        <Stat to={totalPrograms} label="진행 중 지원 공고" />
        <Stat to={PROVINCE_COUNT} label="광역 시·도 커버" suffix="개" />
        <Stat to={SOURCE_COUNT} label="공식 데이터 출처" suffix="개" />
      </div>
    </section>
  );
}

// 단일 통계 항목 — 큰 숫자(카운트업) + 아래 작은 라벨
function Stat({ to, label, suffix }: { to: number; label: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-[36px] max-md:text-[24px] font-extrabold text-blue-500 leading-none mb-2 tracking-[-0.04em]">
        <CountUp to={to} suffix={suffix} />
      </div>
      <div className="text-[13px] max-md:text-[11px] font-medium text-grey-600 tracking-[-0.01em]">
        {label}
      </div>
    </div>
  );
}
