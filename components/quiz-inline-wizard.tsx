"use client";

// Hero 우측 비로그인 사용자용 AI 진단 wizard (Phase 3, 2026-04-28).
// 5문항 (연령·지역+district·직업·소득·가구) 답하면 /quiz?... 로 이동해
// 서버 매칭 결과 노출. quiz-prefill 쿠키도 함께 저장 → 가입 funnel 자동 prefill.
//
// UX:
//   - 답 선택 즉시 자동 next (1·3·4 단계 단일 선택)
//   - 2단계: region 선택 → district list 노출 → district 선택 시 자동 next
//             ("전체" 옵션 = district null 로 next)
//   - 5단계 (가구 다중 선택): "결과 보기" 버튼으로 마무리
//   - 진행 표시줄 (1/5 ~ 5/5)
//   - "← 이전" 버튼 (실수 시), 1단계에선 disabled
//   - "건너뛰기" — 소득(4) 단계만 (답 없이 next)
//
// 새로고침 시 state 잃음 (복원 X — 단순성 우선).

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AGE_OPTIONS,
  REGION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  HOUSEHOLD_OPTIONS,
  getDistrictsForRegion,
  type AgeOption,
  type RegionOption,
  type OccupationOption,
  type IncomeOption,
  type HouseholdOption,
} from "@/lib/profile-options";
import { saveQuizPrefill } from "@/lib/quiz-prefill";
import { trackEvent, EVENTS } from "@/lib/analytics";

const TOTAL_STEPS = 5;

type Answers = {
  age: AgeOption | null;
  region: RegionOption | null;
  district: string | null;
  occupation: OccupationOption | null;
  income: IncomeOption | null;
  household: HouseholdOption[];
};

const EMPTY: Answers = {
  age: null,
  region: null,
  district: null,
  occupation: null,
  income: null,
  household: [],
};

export function QuizInlineWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [started, setStarted] = useState(false);

  function ensureStarted() {
    if (!started) {
      setStarted(true);
      trackEvent(EVENTS.QUIZ_INLINE_STARTED, {});
    }
  }

  function next() {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  }

  function back() {
    if (step > 1) setStep((s) => s - 1);
  }

  function finish() {
    trackEvent(EVENTS.QUIZ_INLINE_COMPLETED, {});
    saveQuizPrefill({
      ageGroup: answers.age,
      region: answers.region,
      district: answers.district,
      occupation: answers.occupation,
      incomeLevel: answers.income,
      householdTypes: answers.household,
    });
    const qs = new URLSearchParams();
    if (answers.age) qs.set("age", answers.age);
    if (answers.region) qs.set("region", answers.region);
    if (answers.district) qs.set("district", answers.district);
    if (answers.occupation) qs.set("occupation", answers.occupation);
    if (answers.income) qs.set("income", answers.income);
    for (const h of answers.household) qs.append("household", h);
    router.push(`/quiz?${qs.toString()}`);
  }

  // 단일 선택 옵션 버튼 공용 클래스 (연령·지역·직업·소득·가구·district)
  const selectClass = (selected: boolean) =>
    `px-3 py-2.5 rounded-xl border text-[14px] transition-colors text-left cursor-pointer ${
      selected
        ? "bg-blue-500 text-white border-blue-500"
        : "bg-white text-grey-800 border-grey-200 hover:border-blue-300 hover:bg-blue-50"
    }`;

  const districts = answers.region ? getDistrictsForRegion(answers.region) : [];

  return (
    <section className="bg-white rounded-3xl p-6 shadow-lg">
      {/* 헤더 + 진행 표시줄 */}
      <header className="mb-5">
        <h3 className="text-[18px] font-bold text-grey-900">내 자격 1분 진단</h3>
        <p className="text-[13px] max-md:text-[14px] text-grey-600 mt-1">
          5문항 익명 — 가입 불필요
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-grey-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <span className="text-[12px] max-md:text-[13px] text-grey-500 font-semibold">
            {step}/{TOTAL_STEPS}
          </span>
        </div>
      </header>

      {/* step 1: 연령대 */}
      {step === 1 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            연령대를 알려주세요
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {AGE_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  ensureStarted();
                  setAnswers((p) => ({ ...p, age: a }));
                  next();
                }}
                className={selectClass(answers.age === a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 2: 지역 + district (region 선택 → district 노출 → 선택 시 자동 next) */}
      {step === 2 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            어느 지역에 사세요?
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {REGION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  ensureStarted();
                  setAnswers((p) => ({
                    ...p,
                    region: r,
                    district: null,
                  }));
                  // "전국" 은 district 없음 → 즉시 next
                  if (r === "전국") {
                    next();
                  }
                }}
                className={selectClass(answers.region === r)}
              >
                {r}
              </button>
            ))}
          </div>
          {districts.length > 0 && (
            <div className="mt-4">
              <h5 className="text-[14px] max-md:text-[15px] font-semibold text-grey-700 mb-2">
                시·군·구
              </h5>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((p) => ({ ...p, district: null }));
                    next();
                  }}
                  className={selectClass(false)}
                >
                  전체
                </button>
                {districts.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setAnswers((p) => ({ ...p, district: d }));
                      next();
                    }}
                    className={selectClass(answers.district === d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* step 3: 직업 */}
      {step === 3 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            직업을 알려주세요
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {OCCUPATION_OPTIONS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setAnswers((p) => ({ ...p, occupation: o }));
                  next();
                }}
                className={selectClass(answers.occupation === o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 4: 소득 (skip 가능) */}
      {step === 4 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            소득은 어느 정도인가요?
          </h4>
          <div className="space-y-2">
            {INCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAnswers((p) => ({ ...p, income: opt.value }));
                  next();
                }}
                className={`${selectClass(answers.income === opt.value)} w-full`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 5: 가구 (다중 선택, "결과 보기" 로 마무리) */}
      {step === 5 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            가구 상태를 모두 골라주세요
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {HOUSEHOLD_OPTIONS.map((opt) => {
              const selected = answers.household.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setAnswers((p) => ({
                      ...p,
                      household: selected
                        ? p.household.filter((h) => h !== opt.value)
                        : [...p.household, opt.value],
                    }));
                  }}
                  className={selectClass(selected)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 푸터 — 이전 / (4·5단계만) 건너뛰기·결과 보기 */}
      <footer className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 1}
          className="text-[14px] text-grey-500 hover:text-grey-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 border-none bg-transparent cursor-pointer"
        >
          ← 이전
        </button>
        {(step === 4 || step === 5) && (
          <button
            type="button"
            onClick={() => {
              if (step === 5) finish();
              else next();
            }}
            className="text-[14px] font-semibold text-white bg-blue-500 hover:bg-blue-600 px-5 py-2.5 rounded-full border-none cursor-pointer transition-colors"
          >
            {step === 5 ? "결과 보기 →" : "건너뛰기"}
          </button>
        )}
      </footer>
    </section>
  );
}
