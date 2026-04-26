// app/quiz/page.tsx
// "내 자격 1분 진단" 익명 페이지 — 회원가입 없이 5문항 답하면 매칭 정책 즉시.
// Phase 1.5 의 income_target_level + household_target_tags 활용.
//
// 가입 funnel — 결과 본 후 "더 정확한 맞춤 알림 받기" CTA → /signup
// /quiz?age=30대&region=서울&occupation=직장인&income=mid&household=married
// 형태로 URL 직접 공유 가능 (재방문성 ↑, SEO 신호 X — noindex)

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ProgramRow } from '@/components/program-row';
import { welfareToDisplay, loanToDisplay } from '@/lib/programs';
import { scoreAndFilter } from '@/lib/personalization/filter';
import { REGION_ALIASES, type ScorableItem } from '@/lib/personalization/score';
import type { UserSignals } from '@/lib/personalization/types';
import {
  AGE_OPTIONS,
  REGION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  HOUSEHOLD_OPTIONS,
  type AgeOption,
  type RegionOption,
  type OccupationOption,
  type IncomeOption,
} from '@/lib/profile-options';

export const dynamic = 'force-dynamic';

// noindex — 결과가 입력에 따라 달라지는 익명 funnel 페이지. 검색엔진 색인 X.
export const metadata: Metadata = {
  title: '내 자격 1분 진단 — keepioo',
  description:
    '회원가입 없이 5문항으로 본인 자격에 맞는 정부 지원 정책을 즉시 확인하세요. 소득·가구 형태까지 정밀 매칭.',
  robots: { index: false, follow: true },
};

const QUIZ_MIN_SCORE = 4; // 분리 섹션(8) 보다 낮춤 — quiz 는 매칭 적어도 보여줌
const QUIZ_LIMIT = 12;
const POOL_SIZE = 200;

type Row = {
  id: string;
  title: string;
  description: string | null;
  eligibility: string | null;
  detailed_content: string | null;
  region: string | null;
  apply_end: string | null;
  source: string;
  benefit_tags: string[] | null;
  income_target_level: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags: string[] | null;
};

function rowToScorable(row: Row): ScorableItem {
  return {
    id: row.id,
    title: row.title,
    description: [row.description, row.eligibility, row.detailed_content]
      .filter(Boolean)
      .join(' '),
    region: row.region,
    district: null,
    benefit_tags: row.benefit_tags ?? [],
    apply_end: row.apply_end,
    source: row.source,
    income_target_level: row.income_target_level,
    household_target_tags: row.household_target_tags ?? [],
  };
}

function buildRegionOrFilter(userRegion: string | null): string | null {
  if (!userRegion) return null;
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  const clauses = [
    'region.ilike.%전국%',
    ...aliases.map((a) => `region.ilike.%${a}%`),
  ];
  return clauses.join(',');
}

function pickStr<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  if (typeof raw !== 'string') return null;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function pickHouseholds(raw: string | string[] | undefined): string[] {
  const allowed = HOUSEHOLD_OPTIONS.map((o) => o.value);
  const arr =
    typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  return arr.filter((v) => (allowed as string[]).includes(v));
}

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const age = pickStr(sp.age, AGE_OPTIONS);
  const region = pickStr(sp.region, REGION_OPTIONS);
  const occupation = pickStr(sp.occupation, OCCUPATION_OPTIONS);
  const income = pickStr(
    sp.income,
    INCOME_OPTIONS.map((o) => o.value),
  ) as IncomeOption | null;
  const householdTypes = pickHouseholds(sp.household);

  const hasInput = !!age && !!region && !!occupation;

  if (!hasInput) {
    return <QuizForm />;
  }

  // 결과 — welfare + loan pool 가져와서 점수 매칭
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const regionOrFilter = buildRegionOrFilter(region);

  const COLUMNS =
    'id, title, description, eligibility, detailed_content, region, apply_end, source, benefit_tags, income_target_level, household_target_tags';

  let welfareQ = supabase
    .from('welfare_programs')
    .select(COLUMNS)
    .or(`apply_end.gte.${today},apply_end.is.null`);
  let loanQ = supabase
    .from('loan_programs')
    .select(COLUMNS)
    .or(`apply_end.gte.${today},apply_end.is.null`);

  if (regionOrFilter) {
    welfareQ = welfareQ.or(regionOrFilter);
    loanQ = loanQ.or(regionOrFilter);
  }

  const [welfareRes, loanRes] = await Promise.all([
    welfareQ
      .order('apply_end', { ascending: true, nullsFirst: false })
      .limit(POOL_SIZE),
    loanQ
      .order('apply_end', { ascending: true, nullsFirst: false })
      .limit(POOL_SIZE),
  ]);

  const signals: UserSignals = {
    ageGroup: age as AgeOption,
    region: region as RegionOption,
    district: null,
    occupation: occupation as OccupationOption,
    incomeLevel: income,
    householdTypes,
    benefitTags: [], // quiz 는 관심 태그 안 받음 (5문항 단순화)
  };

  const welfareScored = scoreAndFilter(
    (welfareRes.data ?? []).map(rowToScorable),
    signals,
    { minScore: QUIZ_MIN_SCORE, limit: QUIZ_LIMIT },
  );
  const loanScored = scoreAndFilter(
    (loanRes.data ?? []).map(rowToScorable),
    signals,
    { minScore: QUIZ_MIN_SCORE, limit: QUIZ_LIMIT },
  );

  // welfare/loan 합산 후 점수 내림차순 top QUIZ_LIMIT
  const combined = [...welfareScored, ...loanScored]
    .sort((a, b) => b.score - a.score)
    .slice(0, QUIZ_LIMIT);

  // 원본 row 를 다시 찾아 DisplayProgram 으로 변환
  const welfareById = new Map((welfareRes.data ?? []).map((r) => [r.id, r]));
  const loanById = new Map((loanRes.data ?? []).map((r) => [r.id, r]));
  const displayPrograms = combined.map((s) => {
    const w = welfareById.get(s.item.id);
    if (w) return welfareToDisplay(w as never);
    const l = loanById.get(s.item.id);
    if (l) return loanToDisplay(l as never);
    return null;
  }).filter((p): p is NonNullable<typeof p> => p !== null);

  return <QuizResult input={{ age: age!, region: region!, occupation: occupation!, income, householdTypes }} programs={displayPrograms} />;
}

// ============================================================
// 폼 (입력 없을 때) — server form GET
// ============================================================
function QuizForm() {
  return (
    <main className="pt-28 pb-20 max-w-[640px] mx-auto px-10 max-md:pt-24 max-md:px-6">
      <p className="text-[13px] font-semibold text-blue-500 mb-3 tracking-wide">
        1분 진단 · 회원가입 불필요
      </p>
      <h1 className="text-[32px] font-extrabold tracking-[-1px] text-grey-900 mb-3 max-md:text-[26px]">
        내 자격에 맞는 정책,
        <br />
        1분이면 보여드릴게요
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.65] mb-10 max-w-[500px]">
        5문항만 답하면 본인 소득·가구·지역에 맞는 정부 지원 정책을 즉시 보여드려요.
      </p>

      <form
        method="GET"
        action="/quiz"
        className="space-y-6 bg-white rounded-2xl shadow-sm p-6 max-md:p-5"
      >
        <FormSelect
          name="age"
          label="① 나이대"
          required
          options={AGE_OPTIONS.map((v) => ({ value: v, label: v }))}
        />
        <FormSelect
          name="region"
          label="② 거주 지역 (광역)"
          required
          options={REGION_OPTIONS.map((v) => ({ value: v, label: v }))}
        />
        <FormSelect
          name="occupation"
          label="③ 직업"
          required
          options={OCCUPATION_OPTIONS.map((v) => ({ value: v, label: v }))}
        />
        <FormSelect
          name="income"
          label="④ 소득 수준 (선택)"
          options={INCOME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        {/* 가구 형태 — 다중 체크박스 (한부모 + 다자녀 등 동시 가능) */}
        <fieldset>
          <legend className="block text-[14px] font-semibold text-grey-700 mb-2">
            ⑤ 가구 형태 (선택, 복수 가능)
          </legend>
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            {HOUSEHOLD_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-2.5 bg-grey-50 hover:bg-grey-100 rounded-xl cursor-pointer min-h-[44px]"
              >
                <input
                  type="checkbox"
                  name="household"
                  value={o.value}
                  className="w-4 h-4"
                />
                <span className="text-[14px] text-grey-900">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="w-full min-h-[56px] text-[16px] font-bold rounded-2xl bg-blue-500 text-white hover:bg-blue-600 border-0 cursor-pointer transition-colors shadow-blue-glow"
        >
          내 자격에 맞는 정책 보기 →
        </button>
        <p className="text-[12px] text-grey-600 text-center">
          입력 정보는 저장되지 않아요. 브라우저 닫으면 사라져요.
        </p>
      </form>
    </main>
  );
}

function FormSelect({
  name,
  label,
  options,
  required,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={`quiz-${name}`}
        className="block text-[14px] font-semibold text-grey-700 mb-2"
      >
        {label}
        {required && <span className="text-red ml-1">*</span>}
      </label>
      <select
        id={`quiz-${name}`}
        name={name}
        required={required}
        className="w-full min-h-[48px] px-4 text-[15px] rounded-xl border border-grey-200 bg-white text-grey-900 focus:border-blue-500 focus:outline-none"
        defaultValue=""
      >
        <option value="" disabled>
          선택해주세요
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// 결과
// ============================================================
type ResultInput = {
  age: string;
  region: string;
  occupation: string;
  income: string | null;
  householdTypes: string[];
};

function QuizResult({
  input,
  programs,
}: {
  input: ResultInput;
  programs: Awaited<ReturnType<typeof welfareToDisplay>>[];
}) {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:pt-24 max-md:px-6">
      <Link
        href="/quiz"
        className="inline-flex items-center text-[13px] text-grey-600 hover:text-grey-900 no-underline mb-3"
      >
        ← 다시 진단하기
      </Link>
      <h1 className="text-[28px] font-extrabold tracking-[-1px] text-grey-900 mb-2 max-md:text-[24px]">
        매칭된 정책 {programs.length}건
      </h1>
      <p className="text-[14px] text-grey-700 mb-6 leading-[1.55]">
        {input.age} · {input.region} · {input.occupation}
        {input.income && ` · 소득 ${INCOME_OPTIONS.find((o) => o.value === input.income)?.label ?? input.income}`}
        {input.householdTypes.length > 0 &&
          ` · ${input.householdTypes
            .map((t) => HOUSEHOLD_OPTIONS.find((o) => o.value === t)?.label ?? t)
            .join('·')}`}
      </p>

      {/* 가입 유도 CTA — 결과 위쪽에 명확히 노출 */}
      <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-4 max-md:flex-col max-md:items-start">
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-blue-900 mb-1">
            새 정책이 나오면 카톡·이메일로 알려드릴까요?
          </p>
          <p className="text-[13px] text-blue-800 leading-[1.55]">
            가입하면 본인 자격에 맞는 신규 정책을 매일 자동으로 받아볼 수 있어요. (무료)
          </p>
        </div>
        <Link
          href="/signup"
          className="shrink-0 inline-flex items-center min-h-[44px] px-5 text-[14px] font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl no-underline"
        >
          무료 가입 →
        </Link>
      </div>

      {programs.length === 0 ? (
        <div className="bg-cream rounded-2xl p-10 text-center text-grey-700">
          현재 매칭되는 활성 정책이 없어요. 조건을 조금 바꿔서 다시 진단해보세요.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-2">
          {programs.map((p) => (
            <ProgramRow key={`${p.type}-${p.id}`} program={p} />
          ))}
        </div>
      )}
    </main>
  );
}
