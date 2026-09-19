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

const primarySources = [
  "정부24·보조금24 — 개인 조건별 정부 혜택과 신청 경로 확인",
  "복지로 — 복지 급여, 의료·주거·돌봄 지원의 공식 안내 확인",
  "기업마당·소상공인24·소상공인시장진흥공단 — 소상공인 정책자금과 지원사업 확인",
  "온통청년·청년정책 관련 공식 사이트 — 청년 지원사업 조건 확인",
  "지자체 공식 홈페이지와 공고문 — 거주지 제한, 예산 소진, 접수 기간 확인",
  "공공데이터포털 — 공개 데이터셋 기반 정책 목록 확인",
];

const sourcePriority = [
  "신청 권한이 있는 기관의 공고문과 신청 화면을 가장 우선합니다.",
  "중앙정부 안내와 지자체 공고가 다르면 실제 접수 기관의 최신 공고를 우선합니다.",
  "보도자료나 뉴스는 맥락 파악에만 사용하고, 대상·금액·기간의 최종 기준으로 삼지 않습니다.",
  "커뮤니티, 개인 블로그, 광고성 글은 핵심 사실의 근거로 사용하지 않습니다.",
];

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
        <p>
          정책 정보는 제목이 비슷해도 신청 권한, 접수 기간, 제출 서류가 다를 수 있습니다. 정책알리미는 사용자가 실제 신청할 때 확인해야 하는 공식 경로를 우선해 정리합니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          {primarySources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">출처 우선순위</h2>
        <p>
          같은 사업명이 여러 사이트에 올라와 있을 때는 “어디에서 실제로 접수하는지”를 먼저 봅니다. 정책 홍보 페이지, 카드뉴스, 보도자료는 이해를 돕지만 최종 신청 조건이 아닐 수 있습니다. 그래서 신청 화면, 공고문 첨부파일, 담당 기관 안내를 가장 높은 우선순위로 둡니다.
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          {sourcePriority.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">출처 표시 원칙</h2>
        <p>
          가이드와 상세 페이지에는 가능한 경우 공식 신청 링크, 담당 기관, 확인일 또는 갱신 기준을 표시합니다. 같은 정책이 여러 출처에 동시에 올라온 경우에는 신청 권한이 있는 기관의 공고를 우선합니다.
        </p>
        <p>
          정책 조건은 수시로 바뀔 수 있습니다. 특히 예산 소진형 사업, 지자체 공고, 금융·대출형 지원은 접수 상태가 빠르게 바뀌므로 최종 신청 전 공식 페이지에서 다시 확인해야 합니다. 예산이 모두 소진되었거나 접수 회차가 종료된 경우, 과거 정보가 검색 결과에 남아 있어도 신청 가능 상태가 아닐 수 있습니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">공개 데이터 자료의 처리</h2>
        <p>
          정책알리미는 공개 데이터와 공공기관 페이지를 참고해 정책 목록을 정리할 수 있습니다. 다만 원문에서 가져온 문장은 그대로 신뢰하지 않고, 사용자가 신청 판단에 쓰는 가이드에서는 대상·서류·마감·중복 제한을 다시 사람이 읽을 수 있는 형태로 정리합니다.
        </p>
        <p>
          수집 시점과 사용자가 보는 시점 사이에 정책 상태가 바뀔 수 있으므로, 상세 페이지와 가이드에는 “공식 공고 확인”을 반복해서 안내합니다. 사이트의 역할은 공공 정보를 찾기 쉽게 정리하는 것이며, 공식 기관을 대신해 접수 가능 여부를 확정하지 않습니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900">사용하지 않는 출처</h2>
        <p>
          정책알리미는 확인되지 않은 후기, 광고성 랜딩 페이지, 출처 없는 표, 개인 경험담만으로 대상·금액·기간을 확정하지 않습니다. 이런 자료는 사용자의 궁금증을 이해하는 참고가 될 수는 있지만, 정책 조건의 근거로 쓰지 않습니다.
        </p>
        <p>
          외부 뉴스나 보도자료를 참고할 때도 원문 신청 경로가 따로 있으면 그 경로를 다시 확인합니다. 사용자가 신청 전 마지막으로 확인해야 하는 곳은 항상 담당 기관의 공식 공고와 신청 화면입니다.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border bg-gray-50 p-5 leading-relaxed text-gray-700">
        <h2 className="text-xl font-bold text-grey-900 mb-3">출처 오류 제보</h2>
        <p>
          원문 링크가 깨졌거나 더 최신 공고가 있으면 <Link href="/contact" className="text-blue-600 underline">문의하기</Link>로 알려주세요. 확인 후 가이드와 내부 정책 데이터를 수정합니다. 제보할 때는 문제가 있는 페이지 주소, 공식 공고 주소, 다른 부분을 함께 적어주시면 더 빠르게 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
