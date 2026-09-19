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

const writingRules = [
  "정책명, 대상, 신청 기간, 지원 내용은 가능한 한 공식 기관 공고와 원문 링크를 기준으로 확인합니다.",
  "사용자가 놓치기 쉬운 조건, 제출 서류, 중복 수급 제한, 예산 소진 가능성을 별도 문단으로 정리합니다.",
  "금액·기간·자격이 바뀔 수 있는 내용은 단정하지 않고 최종 확인이 필요한 항목으로 표시합니다.",
  "광고·제휴·상업적 이해관계가 글의 결론을 바꾸지 않도록 공공 정보성과 신청 안전성을 우선합니다.",
];

const reviewChecklist = [
  "공식 출처 또는 담당 기관 공고가 확인되는지 봅니다.",
  "신청 전 확인 항목, 대상 기준, 서류·증빙, 마감·예산, 중복 제한 신호가 들어 있는지 점검합니다.",
  "신청자가 바로 확인해야 할 문의처, 원문 링크, 보완 요청 가능성을 빠뜨리지 않았는지 확인합니다.",
  "정책 상세가 짧거나 원문 확인용 성격이 강한 페이지는 검색엔진 제출보다 내부 탐색용으로 둡니다.",
];

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
        <p>
          정책알리미의 기본 독자는 정책 이름보다 “내가 받을 수 있는지”, “무엇을 준비해야 하는지”, “어디에서 최종 확인해야 하는지”가 더 급한 사람입니다. 그래서 글은 사업 홍보 문구보다 신청 판단에 필요한 기준을 먼저 씁니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          {writingRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">검수 기준</h2>
        <p>
          각 가이드는 발행 전 공식 출처, 신청 전 확인 항목, 대상 기준, 서류·증빙, 마감·예산, 중복 제한 신호가 들어 있는지 점검합니다. 정책 상세가 짧거나 원문 확인용 성격이 강한 페이지는 검색엔진 제출보다 내부 탐색용으로 둡니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          {reviewChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          같은 정책이라도 지자체, 접수 회차, 예산 상태에 따라 실제 접수 가능 여부가 달라질 수 있습니다. 글 안에서는 확인 가능한 사실과 신청자가 추가로 확인해야 할 항목을 구분하고, 불확실한 내용은 “자세히 확인 필요”로 남깁니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">수정과 갱신 원칙</h2>
        <p>
          정책 정보는 한 번 작성하면 끝나는 정보가 아닙니다. 접수 기간 연장, 예산 소진, 대상 확대, 서류 변경, 담당 부서 변경처럼 신청 결과에 영향을 주는 변화가 생길 수 있습니다. 정책알리미는 정기 점검과 사용자 제보를 통해 오래된 문구를 고치고, 신청 판단에 중요한 변화는 본문에서 더 잘 보이게 정리합니다.
        </p>
        <p>
          오래된 정책을 무리하게 최신 정보처럼 보이게 만들지 않습니다. 종료되었거나 신청 경로가 닫힌 사업은 종료·확인 필요 신호를 남기고, 신규 신청을 유도하는 문구보다 공식 확인을 우선합니다. 사용자가 실제 신청 단계에서 손해를 보지 않도록 빠른 클릭보다 안전한 확인을 기준으로 편집합니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">한계와 사용자 확인</h2>
        <p>
          정책알리미의 글은 법률·세무·금융 자문이 아닙니다. 사용자는 최종 신청 전 공식 기관의 최신 공고와 담당자 안내를 확인해야 합니다. 특히 소득, 재산, 가구 구성, 사업자 상태, 체납 여부, 기존 수급 이력처럼 개인별로 달라지는 조건은 사이트 본문만으로 최종 판단할 수 없습니다.
        </p>
        <p>
          신청자가 불이익을 받지 않도록, 가이드에는 문의 전 준비 질문과 서류 확인 순서를 함께 넣습니다. 정책알리미가 제공하는 정보는 신청 전 점검표 역할이며, 최종 접수·선정·환수 기준은 담당 기관과 공고문이 우선합니다.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border bg-gray-50 p-5 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900 mb-3">정정 요청</h2>
        <p>
          오래된 정보, 잘못된 링크, 누락된 조건을 발견하면 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>로 알려주세요. 확인 가능한 원문 링크와 함께 보내주시면 우선 검토합니다. 제보 내용은 공식 출처로 다시 확인한 뒤 가이드, 정책 상세, 내부 데이터 중 필요한 위치에 반영합니다.
        </p>
      </section>
    </main>
  );
}
