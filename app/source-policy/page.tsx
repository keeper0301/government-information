import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "출처 정책 — 정책알리미",
  description: "정책알리미가 사용하는 공공 정책 정보 출처와 확인 방식을 안내합니다.",
  alternates: { canonical: "/source-policy" },
  robots: { index: true, follow: true },
};

export default function SourcePolicyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-blue-600 mb-2">keepioo trust</p>
        <h1 className="text-3xl font-bold mb-3">출처 정책</h1>
        <p className="text-gray-700 leading-relaxed">
          정책알리미는 공개된 정부·공공기관 자료를 바탕으로 정책 정보를 정리합니다. 출처가 불분명하거나 개인 블로그·커뮤니티에만 있는 내용은 핵심 사실의 기준으로 사용하지 않습니다.
        </p>
      </header>

      <section className="space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">주요 확인 출처</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>정부24·보조금24 — 개인 조건별 정부 혜택과 신청 경로 확인</li>
          <li>복지로 — 복지 급여, 의료·주거·돌봄 지원의 공식 안내 확인</li>
          <li>기업마당·소상공인24·소상공인시장진흥공단 — 소상공인 정책자금과 지원사업 확인</li>
          <li>온통청년·청년정책 관련 공식 사이트 — 청년 지원사업 조건 확인</li>
          <li>지자체 공식 홈페이지와 공고문 — 거주지 제한, 예산 소진, 접수 기간 확인</li>
          <li>공공데이터포털 — 공개 데이터셋 기반 정책 목록 확인</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">출처 표시 원칙</h2>
        <p>
          가이드와 상세 페이지에는 가능한 경우 공식 신청 링크, 담당 기관, 확인일 또는 갱신 기준을 표시합니다. 같은 정책이 여러 출처에 동시에 올라온 경우에는 신청 권한이 있는 기관의 공고를 우선합니다.
        </p>
        <p>
          정책 조건은 수시로 바뀔 수 있습니다. 특히 예산 소진형 사업, 지자체 공고, 금융·대출형 지원은 접수 상태가 빠르게 바뀌므로 최종 신청 전 공식 페이지에서 다시 확인해야 합니다.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border bg-gray-50 p-5 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900 mb-3">출처 오류 제보</h2>
        <p>
          원문 링크가 깨졌거나 더 최신 공고가 있으면 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>로 알려주세요. 확인 후 가이드와 내부 정책 데이터를 수정합니다.
        </p>
      </section>
    </main>
  );
}
