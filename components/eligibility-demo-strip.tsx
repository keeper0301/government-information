import Link from "next/link";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";

const demoSteps = [
  { label: "지역", value: "서울 · 관악구", tone: "bg-blue-50 text-blue-700" },
  { label: "직업", value: "자영업자", tone: "bg-emerald-50 text-emerald-700" },
  { label: "가구", value: "1인가구", tone: "bg-violet-50 text-violet-700" },
];

const matchedPolicies = [
  "마감 임박 정책 먼저 표시",
  "서류·중복 제한 확인",
  "내 조건과 맞지 않는 정책 제외",
];

export function EligibilityDemoStrip({ compact = false }: { compact?: boolean }) {
  const primaryHref = ADSENSE_REVIEW_MODE ? "/guides" : "/quiz";
  const primaryLabel = ADSENSE_REVIEW_MODE ? "진단 기준 가이드 보기 →" : "1분 진단 체험하기 →";

  return (
    <section
      className={`rounded-[28px] border border-blue-100 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.06)] ${
        compact ? "p-5 md:p-6" : "p-6 md:p-8"
      }`}
      aria-labelledby={compact ? "eligibility-demo-compact-title" : "eligibility-demo-title"}
    >
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-[12px] font-extrabold tracking-[0.12em] text-blue-600 mb-3">
            1분 자격 진단 미리보기
          </p>
          <h2
            id={compact ? "eligibility-demo-compact-title" : "eligibility-demo-title"}
            className="text-[24px] md:text-[30px] font-extrabold tracking-[-0.7px] text-grey-900 leading-[1.25] mb-3"
          >
            정책알리미는 목록보다 먼저
            <br />내 조건과 맞는지를 보여줍니다.
          </h2>
          <p className="text-[15px] leading-[1.8] text-grey-700 mb-5">
            나이·지역·직업·소득·가구 정보를 5문항으로 받아서 마감 임박 정책,
            신청 전 확인할 서류, 중복 제한 가능성을 함께 정리합니다. 그래서 검수자가
            봐도 단순 공고 복사 목록이 아니라 사용자의 판단을 돕는 서비스 목적이 바로 드러납니다.
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {demoSteps.map((step) => (
              <span
                key={step.label}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold ${step.tone}`}
              >
                <span className="opacity-70">{step.label}</span>
                {step.value}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-[14px] font-extrabold text-white no-underline hover:bg-blue-700"
            >
              {primaryLabel}
            </Link>
            <Link
              href="/guides"
              className="inline-flex items-center justify-center rounded-full border border-grey-200 bg-white px-5 py-3 text-[14px] font-bold text-grey-900 no-underline hover:border-blue-300 hover:bg-blue-50"
            >
              신청 전 가이드 보기
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-50 via-white to-emerald-50 border border-grey-100 p-4 md:p-5">
          <div className="absolute right-5 top-5 rounded-full bg-white/80 px-3 py-1 text-[12px] font-bold text-blue-700 shadow-sm">
            데모 화면
          </div>
          <div className="rounded-[22px] bg-white border border-grey-100 shadow-sm p-5 mt-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[13px] text-grey-500 font-semibold">질문 3/5</div>
                <div className="text-[18px] font-extrabold text-grey-900">현재 하시는 일은?</div>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-extrabold">
                3
              </div>
            </div>
            <div className="h-2 rounded-full bg-grey-100 overflow-hidden mb-5">
              <div className="h-full w-[60%] rounded-full bg-blue-600" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {[
                "직장인",
                "자영업자",
                "프리랜서",
                "구직 중",
              ].map((label) => (
                <div
                  key={label}
                  className={`rounded-2xl border px-3 py-3 text-[14px] font-bold ${
                    label === "자영업자"
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-grey-200 bg-white text-grey-700"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-grey-50 border border-grey-100 p-4">
              <div className="text-[13px] font-extrabold text-grey-900 mb-3">
                진단 후 보여주는 것
              </div>
              <ul className="space-y-2">
                {matchedPolicies.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[13px] text-grey-700 leading-[1.55]">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-extrabold text-emerald-700">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-3 text-center text-[12px] text-grey-500">
            실제 결과는 최신 공고·담당 기관 기준으로 다시 확인해야 합니다.
          </div>
        </div>
      </div>
    </section>
  );
}
