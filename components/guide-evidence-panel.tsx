import Link from "next/link";
import type { GuideEvidence } from "@/lib/guide-evidence";
export function GuideEvidencePanel({ evidence, reviewer, reviewedAt }: { evidence: GuideEvidence; reviewer?: string; reviewedAt?: string }) {
  return <section className="not-prose mb-8 space-y-6" aria-label="출처와 확인 범위" data-content-ad-eligible="false">
    <div className="rounded-xl bg-blue-50 p-5"><h2 className="text-xl font-bold mb-3">{evidence.question}</h2><p className="leading-relaxed text-grey-700">{evidence.answer}</p></div>
    {evidence.status === "closed" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"><strong>2026년 해당 신규 모집은 마감됐습니다.</strong> 이 글은 지난 모집의 확인 자료입니다. 새 회차나 다른 지자체의 현재 접수 여부는 별도 공식 공고로 확인하세요.</p>}
    <p className="text-sm leading-relaxed text-grey-600">편집 상태: {evidence.status === "closed" ? "해당 모집 접수 마감 · 아래 명시한 출처 확인" : "아래 명시한 출처 확인"} · {reviewer && reviewedAt ? `편집 검수 완료: ${reviewer} (${reviewedAt.slice(0, 10)})` : "운영자 편집 검수 대기"} · 내용 수정일 {evidence.actualUpdatedAt}. 출처 확인은 신청 가능 여부나 전문가 검수를 보장하지 않습니다.</p>
    {evidence.conditions.length > 0 && <h2 className="text-xl font-bold">공식 안내와 신청 전 질문</h2>}
    <dl className="space-y-4">{evidence.conditions.map(row => <div key={row.item} className="border-b border-grey-200 pb-4"><dt className="font-bold mb-2">{row.item}</dt><dd className="m-0 grid gap-3 sm:grid-cols-2 text-sm leading-relaxed"><p><span className="block font-semibold text-grey-900 mb-1">공식 안내·확인 범위</span>{row.fact}</p><p><span className="block font-semibold text-grey-900 mb-1">keepioo의 준비 질문</span>{row.interpretation}</p></dd></div>)}</dl>
    <h2 className="text-xl font-bold">직접 확인한 자료</h2>
    <ul className="space-y-4">{evidence.sources.map(source => <li key={source.url} className="text-sm leading-relaxed"><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-words">{source.agency} — {source.title} ↗</a><p className="mt-1 text-grey-600">출처 확인일 {source.checkedAt} · {source.scope}</p></li>)}</ul>
    <p className="text-sm text-grey-600 leading-relaxed">변경 내용: {evidence.changeLog} 책임 편집: keepioo 운영자. 외부 자료의 출처 표시는 사진·첨부파일의 재사용 허가를 뜻하지 않습니다. <Link href="/correction-policy" className="text-blue-600 underline">정정 기준</Link> · <Link href="/contact" className="text-blue-600 underline">오류 제보</Link></p>
  </section>;
}
