import type { Metadata } from "next";
import { getPopularWelfare, getPopularLoans } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";

export const metadata: Metadata = {
  title: "인기정책 — 정책알리미",
  description: "가장 많이 조회된 복지·대출 정책을 확인하세요.",
};

// 10분마다 자동 갱신
export const revalidate = 600;

// 탭 타입 정의
type Tab = "welfare" | "loan";

export default async function PopularPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  // 현재 선택된 탭 (기본값: welfare)
  const currentTab: Tab = params.tab === "loan" ? "loan" : "welfare";

  // 선택된 탭에 따라 데이터 조회
  const programs =
    currentTab === "welfare"
      ? await getPopularWelfare(20)
      : await getPopularLoans(20);

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 페이지 제목 */}
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        인기정책
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        가장 많이 조회된 복지·대출 정책 TOP 20
      </p>

      {/* 탭 버튼 */}
      <div className="flex gap-2 mb-8">
        <a
          href="/popular?tab=welfare"
          className={`px-5 py-2.5 text-[14px] font-semibold rounded-lg no-underline transition-colors ${
            currentTab === "welfare"
              ? "bg-grey-900 text-white"
              : "bg-grey-100 text-grey-600 hover:bg-grey-200"
          }`}
        >
          복지 TOP
        </a>
        <a
          href="/popular?tab=loan"
          className={`px-5 py-2.5 text-[14px] font-semibold rounded-lg no-underline transition-colors ${
            currentTab === "loan"
              ? "bg-grey-900 text-white"
              : "bg-grey-100 text-grey-600 hover:bg-grey-200"
          }`}
        >
          대출 TOP
        </a>
      </div>

      {/* 인기 정책 목록 */}
      {programs.length > 0 ? (
        <div>
          {programs.map((program, index) => (
            <div key={program.id} className="flex items-center gap-3">
              {/* 순위 번호 */}
              <div
                className={`shrink-0 w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold ${
                  index < 3
                    ? "bg-blue-500 text-white"
                    : "bg-grey-100 text-grey-600"
                }`}
              >
                {index + 1}
              </div>
              {/* 프로그램 행 */}
              <div className="flex-1 min-w-0">
                <ProgramRow program={program} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-grey-600 text-[15px]">
          표시할 정책이 없습니다.
        </div>
      )}
    </main>
  );
}
