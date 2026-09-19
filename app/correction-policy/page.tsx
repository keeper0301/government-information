import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "정정·수정 정책 — 정책알리미",
  description: "정책알리미의 오류 제보, 정정 검토, 수정 반영 기준을 안내합니다.",
  alternates: { canonical: "/correction-policy" },
  robots: { index: true, follow: true },
};

const correctionTargets = [
  "공식 신청 링크가 변경되었거나 접속되지 않는 경우",
  "신청 기간, 대상, 지원 금액, 제출 서류가 최신 공고와 다른 경우",
  "중복 수급 제한, 제외 대상, 환수 가능성처럼 신청 판단에 중요한 조건이 빠진 경우",
  "지자체명, 기관명, 문의처, 사업명이 잘못 표시된 경우",
  "정책 종료, 예산 소진, 접수 중단 상태가 반영되지 않은 경우",
];

const processSteps = [
  "제보가 들어오면 문제가 된 페이지와 공식 출처 또는 담당 기관 공고를 먼저 확인합니다.",
  "신청 판단에 영향을 주는 오류는 우선 수정하고, 필요한 경우 가이드 본문에 주의 문구를 추가합니다.",
  "확인할 수 없는 내용은 추측으로 반영하지 않고 문의처 확인이 필요하다고 표시합니다.",
  "정책이 종료되었거나 회수된 경우에는 검색 노출과 추천 우선순위를 낮춥니다.",
  "수정 뒤에는 같은 유형의 다른 가이드나 상세 페이지에도 같은 문제가 있는지 함께 확인합니다.",
];

export default function CorrectionPolicyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-blue-600 mb-2">keepioo trust</p>
        <h1 className="text-3xl font-bold mb-3">정정·수정 정책</h1>
        <p className="text-gray-700 leading-relaxed">
          정책 정보는 접수 기간, 예산, 대상 조건이 바뀔 수 있습니다. 정책알리미는 오류 제보와 자체 점검을 통해 사용자가 잘못된 정보로 신청 판단을 하지 않도록 정정 절차를 운영합니다.
        </p>
      </header>

      <section className="space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">정정 대상</h2>
        <p>
          정정은 단순 맞춤법보다 신청 결과에 영향을 줄 수 있는 내용을 우선합니다. 특히 마감, 대상, 서류, 중복 제한, 신청 링크는 사용자가 실제 행동을 결정하는 항목이므로 빠르게 확인합니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          {correctionTargets.map((target) => (
            <li key={target}>{target}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">처리 방식</h2>
        <ol className="list-decimal pl-5 space-y-2">
          {processSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          신청 마감이 임박했거나 잘못된 정보가 사용자에게 손해를 줄 수 있는 경우에는 일반 문구 수정보다 먼저 경고 문구와 공식 확인 안내를 추가합니다. 정확한 새 조건이 확인되기 전까지는 임의로 금액이나 대상 기준을 고쳐 쓰지 않습니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">우선순위와 처리 시간</h2>
        <p>
          접수 중인 사업의 마감·신청 링크·대상 조건 오류는 가장 높은 우선순위로 봅니다. 그다음은 사용자가 문의하거나 서류를 준비하는 데 영향을 주는 내용, 마지막은 표현 개선이나 설명 보강입니다.
        </p>
        <p>
          제보는 가능한 한 빠르게 확인하지만, 담당 기관 공고와 신청 화면에서 확인되지 않는 내용은 바로 반영하지 않을 수 있습니다. 출처가 명확한 오류는 우선 수정하고, 확인이 필요한 내용은 “공식 문의 필요”로 표시해 사용자가 단정적으로 받아들이지 않도록 합니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">수정 후 확인</h2>
        <p>
          수정이 끝나면 해당 페이지의 제목, 본문, 신청 링크, 관련 가이드 연결을 함께 확인합니다. sitemap이나 review-mode 표면에 포함된 페이지라면 검색엔진과 심사자가 보는 화면에서도 바뀐 내용이 자연스럽게 읽히는지 확인합니다.
        </p>
        <p>
          같은 원인이 반복될 수 있는 경우에는 가이드 작성 기준이나 진단 도구도 함께 보강합니다. 예를 들어 중복 제한 설명이 빠진 정책이 여러 개라면 한 페이지만 고치지 않고, 가이드 품질 점검 기준에 중복 제한 신호를 추가합니다.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border bg-gray-50 p-5 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900 mb-3">제보 방법</h2>
        <p>
          정정 요청은 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>에서 보낼 수 있습니다. 가능하면 문제가 있는 페이지 URL, 공식 공고 링크, 어떤 내용이 다른지 함께 적어주세요. 제보 내용이 신청 판단에 중요하면 우선 검토하고, 확인된 수정 사항은 가이드와 내부 정책 데이터에 반영합니다.
        </p>
      </section>
    </main>
  );
}
