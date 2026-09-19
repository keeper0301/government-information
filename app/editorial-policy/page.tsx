import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "편집 정책 — 정책알리미",
  description: "정책알리미가 정부 지원 정책 가이드를 작성·검수·수정하는 기준을 안내합니다.",
  alternates: { canonical: "/editorial-policy" },
  robots: { index: true, follow: true },
};

export default function EditorialPolicyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-blue-600 mb-2">keepioo trust</p>
        <h1 className="text-3xl font-bold mb-3">편집 정책</h1>
        <p className="text-gray-700 leading-relaxed">
          정책알리미는 정부·지자체가 공개한 원문을 바탕으로 신청자가 실제로 확인해야 할 조건을 쉽게 풀어 쓰는 정보 서비스입니다. 공고를 그대로 복사해 나열하지 않고, 자격·서류·중복 제한·마감 리스크를 분리해 설명합니다.
        </p>
      </header>

      <section className="space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">작성 기준</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>정책명, 대상, 신청 기간, 지원 내용은 가능한 한 공식 기관 공고와 원문 링크를 기준으로 확인합니다.</li>
          <li>사용자가 놓치기 쉬운 조건, 제출 서류, 중복 수급 제한, 예산 소진 가능성을 별도 문단으로 정리합니다.</li>
          <li>금액·기간·자격이 바뀔 수 있는 내용은 단정하지 않고 최종 확인이 필요한 항목으로 표시합니다.</li>
          <li>광고·제휴·상업적 이해관계가 글의 결론을 바꾸지 않도록 공공 정보성과 신청 안전성을 우선합니다.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">검수 기준</h2>
        <p>
          각 가이드는 발행 전 공식 출처, 신청 전 확인 항목, 대상 기준, 서류·증빙, 마감·예산, 중복 제한 신호가 들어 있는지 점검합니다. 정책 상세가 짧거나 원문 확인용 성격이 강한 페이지는 검색엔진 제출보다 내부 탐색용으로 둡니다.
        </p>
        <p>
          정책알리미의 글은 법률·세무·금융 자문이 아닙니다. 사용자는 최종 신청 전 공식 기관의 최신 공고와 담당자 안내를 확인해야 합니다.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border bg-gray-50 p-5 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900 mb-3">정정 요청</h2>
        <p>
          오래된 정보, 잘못된 링크, 누락된 조건을 발견하면 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>로 알려주세요. 확인 가능한 원문 링크와 함께 보내주시면 우선 검토합니다.
        </p>
      </section>
    </main>
  );
}
