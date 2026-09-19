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
        <ul className="list-disc pl-5 space-y-2">
          <li>공식 신청 링크가 변경되었거나 접속되지 않는 경우</li>
          <li>신청 기간, 대상, 지원 금액, 제출 서류가 최신 공고와 다른 경우</li>
          <li>중복 수급 제한, 제외 대상, 환수 가능성처럼 신청 판단에 중요한 조건이 빠진 경우</li>
          <li>지자체명, 기관명, 문의처, 사업명이 잘못 표시된 경우</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">처리 방식</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>제보가 들어오면 공식 출처 또는 담당 기관 공고를 먼저 확인합니다.</li>
          <li>신청 판단에 영향을 주는 오류는 우선 수정하고, 필요한 경우 가이드 본문에 주의 문구를 추가합니다.</li>
          <li>확인할 수 없는 내용은 추측으로 반영하지 않고 문의처 확인이 필요하다고 표시합니다.</li>
          <li>정책이 종료되었거나 회수된 경우에는 검색 노출과 추천 우선순위를 낮춥니다.</li>
        </ol>
      </section>

      <section className="mt-8 rounded-2xl border bg-gray-50 p-5 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900 mb-3">제보 방법</h2>
        <p>
          정정 요청은 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>에서 보낼 수 있습니다. 가능하면 문제가 있는 페이지 URL, 공식 공고 링크, 어떤 내용이 다른지 함께 적어주세요.
        </p>
      </section>
    </main>
  );
}
