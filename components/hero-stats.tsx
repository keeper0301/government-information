// ============================================================
// HeroStats — Hero 영역 아래 "수의 힘" 통계 띠 (토스 전략)
// ============================================================
// 토스 전략: 첫 화면에 강력한 비주얼 = 수가 많거나·움직이거나·호기심.
// keepioo 의 강점인 누적 데이터 (정책 뉴스·진행 공고·정부 출처) 를
// 큰 숫자로 노출 + 카운트업 애니메이션으로 활동감.
//
// 데이터: 매 요청마다 DB COUNT (head:true 옵션으로 데이터 안 가져옴 → 미미한 비용).
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { CountUp } from "./count-up";

export async function HeroStats() {
  const supabase = await createClient();

  // 3개 카운트 병렬 조회. head:true → SELECT 안 하고 count 만 (rows 0건 반환).
  const [
    { count: newsCount },
    { count: welfareCount },
    { count: loanCount },
  ] = await Promise.all([
    supabase.from("news_posts").select("*", { count: "exact", head: true }),
    supabase.from("welfare_programs").select("*", { count: "exact", head: true }),
    supabase.from("loan_programs").select("*", { count: "exact", head: true }),
  ]);

  const totalPrograms = (welfareCount ?? 0) + (loanCount ?? 0);

  // 정부 데이터 출처 — footer 와 동일 (보조금24·복지로·기업마당·소상공인진흥공단·
  // 온통청년·공공데이터포털). 정적 hardcoded 6.
  const sourceCount = 6;

  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-12 max-md:py-8">
      <div className="grid grid-cols-3 gap-6 max-md:gap-3 bg-white rounded-3xl shadow-md ring-1 ring-grey-100 px-10 py-8 max-md:px-5 max-md:py-6">
        <Stat to={newsCount ?? 0} label="정책 뉴스 큐레이션" />
        <Stat to={totalPrograms} label="진행 중 지원 공고" />
        <Stat to={sourceCount} label="공식 데이터 출처" suffix="개" />
      </div>
    </section>
  );
}

// 단일 통계 항목 — 큰 숫자(카운트업) + 아래 작은 라벨
function Stat({ to, label, suffix }: { to: number; label: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-[40px] max-md:text-[26px] font-extrabold text-blue-500 leading-none mb-2 tracking-[-0.04em]">
        <CountUp to={to} suffix={suffix} />
      </div>
      <div className="text-[13px] max-md:text-[11px] font-medium text-grey-600 tracking-[-0.01em]">
        {label}
      </div>
    </div>
  );
}
