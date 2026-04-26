// ============================================================
// CategoryTab — 복지/대출 미리보기 탭 (공통 컴포넌트)
// ============================================================
// /policy 의 "복지" / "대출" 탭에서 사용. 인기 정책 5건 미리보기 +
// 전체 건수 + "전체 보기 →" CTA 로 기존 페이지(/welfare, /loan) 이동.
// ============================================================

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPopularWelfare, getPopularLoans } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";
import { loadUserProfile } from "@/lib/personalization/load-profile";

type Variant = "welfare" | "loan";

const CONFIG = {
  welfare: {
    name: "복지",
    href: "/welfare",
    table: "welfare_programs" as const,
    description: "주거·취업·양육·의료 등 정부에서 운영하는 복지 프로그램",
  },
  loan: {
    name: "대출",
    href: "/loan",
    table: "loan_programs" as const,
    description: "소상공인·자영업자를 위한 정부 대출과 지원금",
  },
};

export async function CategoryTab({ variant }: { variant: Variant }) {
  const config = CONFIG[variant];
  const supabase = await createClient();

  // 미리보기 5건 + 전체 카운트 + 사용자 프로필(자영업자 자격 배지) 병렬 조회.
  const today = new Date().toISOString().split("T")[0];
  const [programs, countResult, profile] = await Promise.all([
    variant === "welfare" ? getPopularWelfare(5) : getPopularLoans(5),
    supabase
      .from(config.table)
      .select("*", { count: "exact", head: true })
      .or(`apply_end.gte.${today},apply_end.is.null`),
    loadUserProfile(),
  ]);
  const total = countResult.count ?? 0;
  const businessProfile = profile?.signals.businessProfile ?? null;

  return (
    <section>
      {/* 섹션 헤더 */}
      <div className="mb-2 flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[18px] font-bold text-grey-900">
          인기 {config.name} 정책 미리보기
        </h2>
        <span className="text-[13px] text-grey-600">
          전체 {total.toLocaleString()}건
        </span>
      </div>
      <p className="text-[14px] text-grey-600 mb-6">{config.description}</p>

      {/* 미리보기 리스트 */}
      {programs.length > 0 ? (
        <div className="bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2 mb-6">
          {programs.map((p) => (
            <ProgramRow key={p.id} program={p} businessProfile={businessProfile} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-grey-600 bg-white border border-grey-200 rounded-2xl mb-6">
          지금 노출 가능한 {config.name} 정책이 없어요.
        </div>
      )}

      {/* 전체 보기 CTA — 깊이 탐색은 기존 페이지로 */}
      <div className="text-center">
        <Link
          href={config.href}
          className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold text-white bg-grey-900 rounded-lg hover:bg-grey-800 no-underline transition-colors min-h-[44px]"
        >
          전체 {config.name} 정보 보기 ({total.toLocaleString()}건)
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
