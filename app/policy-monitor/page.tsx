import type { Metadata } from "next";

import {
  summarizePolicyDraftQueue,
} from "@/lib/aihub-policy-draft-queue";
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
const draftQueue = summarizePolicyDraftQueue();
const sampleQueueItems = draftQueue.items.slice(0, 6);

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
          <a
            href="/policy-monitor/queue.json"
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-700 no-underline hover:bg-emerald-50"
          >
            Draft queue preview
          </a>
          <a
            href="/policy-monitor/readback-preview.json"
            className="rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-bold text-purple-700 no-underline hover:bg-purple-50"
          >
            W3 readback preview
          </a>
          <a
            href="/policy-monitor/draft-cards.json"
            className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 no-underline hover:bg-rose-50"
          >
            W4 draft cards
          </a>
          <a
            href="/policy-monitor/humanize-review-queue.json"
            className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-bold text-orange-700 no-underline hover:bg-orange-50"
          >
            W5 humanize/review queue
          </a>
          <a
            href="/policy-monitor/humanize-preview.json"
            className="rounded-full border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 no-underline hover:bg-teal-50"
          >
            W6 humanize preview
          </a>
          <a
            href="/policy-monitor/operator-review.json"
            className="rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 no-underline hover:bg-indigo-50"
          >
            W7 operator review
          </a>
          <a
            href="/policy-monitor/publish-package-preview.json"
            className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-bold text-sky-700 no-underline hover:bg-sky-50"
          >
            W8 publish package preview
          </a>
          <a
            href="/policy-monitor/publish-approval-request.json"
            className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 no-underline hover:bg-rose-50"
          >
            W9 approval request preview
          </a>
          <a
            href="/policy-monitor/publish-approval-decision-preview.json"
            className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-bold text-orange-700 no-underline hover:bg-orange-50"
          >
            W10 decision preview
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

      <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">Draft candidate queue 미리보기</h2>
            <p className="mt-2 text-sm text-grey-600">
              W2에서는 export row를 초안 후보 큐로 변환하지만, 공식 원문 확인 전에는 모두 needs_fact_readback 상태로 유지합니다.
            </p>
          </div>
          <div className="text-xs font-semibold text-emerald-700">
            전체 {draftQueue.count}개 · needs_fact_readback {draftQueue.countsByStatus.needs_fact_readback}개
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {draftQueue.allowedStatuses.map((status) => (
            <span key={status} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              {status}: {draftQueue.countsByStatus[status]}
            </span>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sampleQueueItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="mb-1 text-xs font-bold text-emerald-600">{item.status}</div>
              <div className="text-sm font-bold text-grey-900">{item.title}</div>
              <div className="mt-2 text-xs leading-5 text-grey-600">
                {item.region} · readback 후보 {item.readbackCandidates.length}개 · 발행/DB/GSC/IndexNow/Naver submit 없음
              </div>
              <div className="mt-2 text-xs text-amber-700">{item.promotionBlockedReason}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W3 공식 원문 readback preview lane</h2>
            <p className="mt-2 text-sm text-grey-600">
              W3는 큐 앞쪽 후보만 소량으로 공식 검색 원문에 접속해 성공한 항목만 ready_for_draft 후보로 분리합니다. 이것은 발행 승인이 아니라 초안 가능성 미리보기입니다.
            </p>
          </div>
          <a
            href="/policy-monitor/readback-preview.json"
            className="w-fit rounded-full bg-purple-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-purple-700"
          >
            live readback JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-purple-700">기본 cap</div>
            후보 5개 · 출처 2개까지만 확인
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-purple-700">성공 기준</div>
            공식 검색 URL HTTP 2xx/3xx
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-purple-700">승격 의미</div>
            ready_for_draft 후보, 발행 승인 아님
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-purple-700">안전선</div>
            DB/write/GSC/IndexNow/Naver 없음
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-rose-100 bg-rose-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W4 humanize/review 초안 카드</h2>
            <p className="mt-2 text-sm text-grey-600">
              W4는 ready_for_draft preview 후보를 공개 발행이 아닌 초안 카드로만 바꿉니다. 모든 카드는 humanize-korean과 운영자 review를 지나야 하며, 글 발행·DB write·외부 제출은 계속 막혀 있습니다.
            </p>
          </div>
          <a
            href="/policy-monitor/draft-cards.json"
            className="w-fit rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-rose-700"
          >
            draft cards JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">입력</div>
            W3 ready_for_draft preview 후보
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">카드 상태</div>
            humanize_required · review_required 전 단계
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">카드 내용</div>
            outline · factsToVerify · sourceUrls
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">안전선</div>
            발행 승인 아님 · GSC/IndexNow/Naver 없음
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W5 humanize/review queue</h2>
            <p className="mt-2 text-sm text-grey-600">
              W5는 초안 카드를 사람말 윤문과 운영자 검토 전용 큐로 넘깁니다. 이 큐도 발행 승인이 아니며, 숫자·지역·기관명·공식 URL 보존과 과장 방지를 먼저 확인합니다.
            </p>
          </div>
          <a
            href="/policy-monitor/humanize-review-queue.json"
            className="w-fit rounded-full bg-orange-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-orange-700"
          >
            humanize/review queue JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">입력</div>
            W4 humanize_required 초안 카드
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">윤문 brief</div>
            자연스러운 한국어 · 사실/URL 보존
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">검토 checklist</div>
            원문·기간·대상·서류·과장 표현 확인
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">안전선</div>
            승인 전 publish=false · 외부 제출 없음
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-teal-100 bg-teal-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W6 humanize preview</h2>
            <p className="mt-2 text-sm text-grey-600">
              W6는 humanize/review queue의 문장을 사람말 preview로 바꿔 보여줍니다. 문체 미리보기일 뿐이며, 원문 검토·운영자 승인 전 공개 발행은 계속 막습니다.
            </p>
          </div>
          <a
            href="/policy-monitor/humanize-preview.json"
            className="w-fit rounded-full bg-teal-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-teal-700"
          >
            humanize preview JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-teal-700">입력</div>
            W5 humanize_required queue item
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-teal-700">출력</div>
            sourceDraftText · humanizedPreviewText
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-teal-700">품질 gate</div>
            사실·URL 보존 · 미확인 단정 금지
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-teal-700">안전선</div>
            preview는 발행 승인 아님 · publish=false
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W7 operator review pass/hold/revision preview</h2>
            <p className="mt-2 text-sm text-grey-600">
              W7은 humanize preview를 운영자 검토용으로 분리합니다. 통과·보류·수정 필요 상태만 미리 나누며, review_passed_preview도 발행 승인이 아닙니다.
            </p>
          </div>
          <a
            href="/policy-monitor/operator-review.json"
            className="w-fit rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-indigo-700"
          >
            operator review JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-indigo-700">입력</div>
            W6 humanized_preview_ready item
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-indigo-700">상태</div>
            review_passed_preview · review_hold · revision_required
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-indigo-700">검토</div>
            pass/hold/revision checklist 분리
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-indigo-700">안전선</div>
            검토 preview는 발행 승인 아님 · publish=false
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W8 publish package preview</h2>
            <p className="mt-2 text-sm text-grey-600">
              W8은 review_passed_preview 항목만 발행 승인 패키지 형태로 묶습니다. 제목, 본문 preview, 메타 설명, 공식 출처, 발행 전 승인 체크리스트까지만 만들며 실제 공개 발행은 하지 않습니다.
            </p>
          </div>
          <a
            href="/policy-monitor/publish-package-preview.json"
            className="w-fit rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-sky-700"
          >
            publish package preview JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-sky-700">입력</div>
            W7 review_passed_preview item만 사용
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-sky-700">패키지</div>
            제목 · 본문 preview · 메타 설명
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-sky-700">근거</div>
            공식 출처 URL · 발행 전 승인 checklist
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-sky-700">안전선</div>
            실제 발행 없음 · 최종 승인 전 publish=false
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-rose-100 bg-rose-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W9 publish approval request preview</h2>
            <p className="mt-2 text-sm text-grey-600">
              W9는 W8 패키지를 운영자 승인 요청 카드로만 감쌉니다. 승인 질문, 선택지, 필수 확인 문구를 보여주지만 승인 저장·실제 발행·외부 제출은 하지 않습니다.
            </p>
          </div>
          <a
            href="/policy-monitor/publish-approval-request.json"
            className="w-fit rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-rose-700"
          >
            approval request preview JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">입력</div>
            W8 publish_package_preview item
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">요청</div>
            승인 질문 · 본문 digest · 공식 출처
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">선택지</div>
            approve preview · hold · revision
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-rose-700">안전선</div>
            승인 저장 없음 · publish=false
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/60 p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-grey-900">W10 publish approval decision preview</h2>
            <p className="mt-2 text-sm text-grey-600">
              W10은 W9 승인 요청에 대한 선택 결과를 receipt preview로만 보여줍니다. 선택값은 URL 파라미터로 바꿀 수 있지만 승인 저장·실제 발행·외부 제출은 하지 않습니다.
            </p>
          </div>
          <a
            href="/policy-monitor/publish-approval-decision-preview.json"
            className="w-fit rounded-full bg-orange-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-orange-700"
          >
            decision preview JSON 보기
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">입력</div>
            W9 approval_request_preview item
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">결정</div>
            approve · hold · revision 선택 preview
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">영수증</div>
            decisionRecorded=false · live 승인 별도
          </div>
          <div className="rounded-xl bg-white p-4 text-sm text-grey-700 shadow-sm">
            <div className="mb-1 font-bold text-orange-700">안전선</div>
            승인 저장 없음 · publish=false
          </div>
        </div>
      </section>
    </main>
  );
}
