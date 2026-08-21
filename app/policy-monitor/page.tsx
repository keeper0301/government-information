import type { Metadata } from "next";

import {
  buildPolicyExportRows,
  buildPolicyTopicSeeds,
  getPrimaryPolicyOpportunities,
} from "@/lib/aihub-policy-opportunities";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "AIHub 정책 데이터 모니터링 | 정책알리미",
  description:
    "AIHub 4순위 정책·복지·청년·소상공인·생활안전 데이터 후보를 지역 정보 콘텐츠와 검증 큐로 연결하는 read-only 모니터링 보드입니다.",
  alternates: { canonical: "/policy-monitor" },
};

const primaryOpportunities = getPrimaryPolicyOpportunities();
const topicSeeds = buildPolicyTopicSeeds();
const exportRows = buildPolicyExportRows(topicSeeds);
const sampleSeeds = exportRows.slice(0, 8);
const sampleReadbackCandidates = exportRows.slice(0, 3).flatMap((row) => row.readbackCandidates.slice(0, 2));

export default function PolicyMonitorPage() {
  return (
    <main className="max-w-content mx-auto px-5 lg:px-10 pt-[80px] pb-20">
      <section className="mb-10 rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6 md:p-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
          AIHub 4순위 · read-only
        </p>
        <h1 className="mb-4 text-[30px] font-extrabold tracking-[-1px] text-grey-900 md:text-[40px]">
          2026 정부·지자체 정책 데이터 모니터링
        </h1>
        <p className="max-w-3xl text-[15px] leading-7 text-grey-700">
          정책, 복지, 청년, 소상공인, 지원금, 공공서비스 데이터를 AIHub 후보와 공공 원문 확인 소스로 묶어 키피오 지역 정보 글감으로 관리합니다. 이 화면은 후보 확인 전용이며, 원문 확인 없이는 자동 발행하지 않습니다.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <div className="text-2xl font-bold text-grey-900">{primaryOpportunities.length}</div>
            <div className="text-sm text-grey-600">AIHub 정책 후보</div>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <div className="text-2xl font-bold text-grey-900">{topicSeeds.length}</div>
            <div className="text-sm text-grey-600">지역 키워드 seed</div>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <div className="text-2xl font-bold text-grey-900">100%</div>
            <div className="text-sm text-grey-600">Fact Readback 필요 표시</div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/policy-monitor/export.json"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-blue-700"
          >
            JSON 후보 export
          </a>
          <a
            href="/policy-monitor/export.csv"
            className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 no-underline hover:bg-blue-50"
          >
            CSV 후보 export
          </a>
          <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            초안 큐 전 단계 · 원문 확인 필수
          </span>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">정책 데이터 후보</h2>
            <p className="mt-2 text-sm text-grey-600">
              AIHub는 글감 구조를 잡는 재료입니다. 실제 신청 조건·마감·서류·지역 시행 여부는 공공 원문으로 다시 확인합니다.
            </p>
          </div>
          <span className="w-fit rounded-full bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
            DB write 없음 · 자동 발행 없음
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {primaryOpportunities.map((item) => (
            <article key={item.policyName} className="rounded-2xl border border-grey-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {item.audience}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  지역 확장 {item.regionScalability}
                </span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                  {item.factReadback}
                </span>
              </div>
              <h3 className="mb-2 text-xl font-bold text-grey-900">{item.policyName}</h3>
              <p className="mb-4 text-sm leading-6 text-grey-600">
                활용: {item.sourceUse} · 모니터링: {item.monitoringCadence}
              </p>
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-bold text-grey-800">BlogFury/키피오 콘텐츠</h4>
                <ul className="space-y-1 text-sm leading-6 text-grey-700">
                  {item.blogfuryContent.map((idea) => (
                    <li key={idea}>· {idea}</li>
                  ))}
                </ul>
              </div>
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-bold text-grey-800">검색 키워드</h4>
                <div className="flex flex-wrap gap-2">
                  {item.searchKeywords.map((keyword) => (
                    <span key={keyword} className="rounded-full border border-grey-200 px-3 py-1 text-xs text-grey-600">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mb-4 rounded-xl bg-grey-50 p-3 text-xs leading-5 text-grey-600">
                공공 원문 확인: {item.publicReadbackSources.join(" · ")}
              </div>
              <a href={item.aihubUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 no-underline hover:underline">
                AIHub 원문 보기 →
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-grey-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">2026 지역 정책 키워드 seed</h2>
            <p className="mt-2 text-sm text-grey-600">
              전국 시·군·구 확장 전, 대표 지역으로 만든 검토용 seed입니다. 전부 원문 확인 후 초안 큐로 넘깁니다.
            </p>
          </div>
          <span className="text-xs font-semibold text-grey-500">샘플 {sampleSeeds.length}개 / 전체 {topicSeeds.length}개</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sampleSeeds.map((seed) => (
            <div key={`${seed.region}-${seed.title}`} className="rounded-xl bg-grey-50 p-4">
              <div className="mb-1 text-xs font-semibold text-blue-600">{seed.region}</div>
              <div className="text-sm font-bold text-grey-900">{seed.title}</div>
              <div className="mt-2 text-xs text-grey-600">
                상태: Fact Readback 필요 · 출처: {seed.publicReadbackSources.slice(0, 2).join(" / ")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">공공 URL readback 후보</h2>
            <p className="mt-2 text-sm text-grey-600">
              W1에서는 정책 seed마다 공식 검색 URL 후보를 자동으로 붙여 초안 큐 전 검증 경로를 만듭니다.
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-700">샘플 {sampleReadbackCandidates.length}개</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sampleReadbackCandidates.map((candidate) => (
            <a
              key={`${candidate.sourceName}-${candidate.searchUrl}`}
              href={candidate.searchUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-blue-100 bg-white p-4 no-underline shadow-sm hover:border-blue-200"
            >
              <div className="mb-1 text-xs font-bold text-blue-600">{candidate.sourceName}</div>
              <div className="text-sm font-semibold text-grey-900">{candidate.query}</div>
              <div className="mt-2 text-xs leading-5 text-grey-600">{candidate.reason}</div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
