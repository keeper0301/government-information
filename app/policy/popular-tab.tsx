// ============================================================
// PopularTab — /policy 의 "인기" 탭 미리보기
// ============================================================
// 복지·대출 분야와 차별화: 두 분야를 섞어서 "지금 사람들이 가장
// 많이 보는 정책" 을 한 화면에 보여주고 /popular 로 깊이 탐색 유도.
// ============================================================

import Link from "next/link";
import { getPopularWelfare, getPopularLoans } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";

export async function PopularTab() {
  // 복지·대출 인기 5건씩 병렬 조회 (10건 두 섹션 노출)
  const [popularWelfare, popularLoans] = await Promise.all([
    getPopularWelfare(5),
    getPopularLoans(5),
  ]);

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-[18px] font-bold text-grey-900 mb-2">
          지금 가장 많이 보는 정책
        </h2>
        <p className="text-[14px] text-grey-600">
          최근 7일 조회수 기준 상위 정책. 마감 가중치까지 반영한 정렬은{" "}
          <Link href="/popular" className="underline hover:text-grey-900">
            인기정책 페이지
          </Link>
          에서 자세히 볼 수 있어요.
        </p>
      </div>

      {/* 복지 인기 TOP 5 */}
      <div className="mb-8">
        <h3 className="text-[15px] font-semibold text-grey-900 mb-3">
          🏠 복지 인기 TOP 5
        </h3>
        {popularWelfare.length > 0 ? (
          <div className="bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {popularWelfare.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-grey-600 bg-white border border-grey-200 rounded-2xl">
            노출 가능한 복지 정책이 없어요.
          </div>
        )}
      </div>

      {/* 대출 인기 TOP 5 */}
      <div className="mb-8">
        <h3 className="text-[15px] font-semibold text-grey-900 mb-3">
          💰 대출·지원금 인기 TOP 5
        </h3>
        {popularLoans.length > 0 ? (
          <div className="bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {popularLoans.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-grey-600 bg-white border border-grey-200 rounded-2xl">
            노출 가능한 대출 정책이 없어요.
          </div>
        )}
      </div>

      {/* 전체 인기 보기 CTA */}
      <div className="text-center">
        <Link
          href="/popular"
          className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold text-white bg-grey-900 rounded-lg hover:bg-grey-800 no-underline transition-colors min-h-[44px]"
        >
          전체 인기 정책 보기 (마감 임박 포함)
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
