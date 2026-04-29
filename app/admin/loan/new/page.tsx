// ============================================================
// /admin/loan/new — 대출·정책자금 수동 등록 폼
// ============================================================
// welfare 와 동일 흐름, loan 컬럼 차이만 반영 (loan_amount/interest_rate/
// repayment_period 추가, region 자유 텍스트 제거).
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createLoanProgram } from "./actions";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "대출·정책자금 수동 등록 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// loan 카테고리 — 기존 운영 분류 (정책자금·소상공인·창업·생계 등)
const CATEGORIES = [
  "정책자금",
  "창업자금",
  "소상공인",
  "생계자금",
  "주거자금",
  "농어업",
  "기타",
] as const;

export default async function NewLoanProgramPage({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    source?: string;
    source_url?: string;
    description?: string;
    news_id?: string;
    target?: string;
    eligibility?: string;
    apply_method?: string;
    apply_url?: string;
    apply_start?: string;
    apply_end?: string;
    category?: string;
    loan_amount?: string;
    interest_rate?: string;
    repayment_period?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/loan/new");
  if (!isAdminUser(user.email)) redirect("/");

  const params = await searchParams;
  const prefill = {
    title: (params.title ?? "").slice(0, 500),
    source: (params.source ?? "").slice(0, 200),
    source_url: (params.source_url ?? "").slice(0, 1000),
    description: (params.description ?? "").slice(0, 10000),
    target: (params.target ?? "").slice(0, 1000),
    eligibility: (params.eligibility ?? "").slice(0, 5000),
    apply_method: (params.apply_method ?? "").slice(0, 2000),
    apply_url: (params.apply_url ?? "").slice(0, 1000),
    apply_start: /^\d{4}-\d{2}-\d{2}$/.test(params.apply_start ?? "")
      ? (params.apply_start as string)
      : "",
    apply_end: /^\d{4}-\d{2}-\d{2}$/.test(params.apply_end ?? "")
      ? (params.apply_end as string)
      : "",
    category: (params.category ?? "").slice(0, 50),
    loan_amount: (params.loan_amount ?? "").slice(0, 500),
    interest_rate: (params.interest_rate ?? "").slice(0, 200),
    repayment_period: (params.repayment_period ?? "").slice(0, 200),
  };
  const hasPrefill = Object.values(prefill).some((v) => v.length > 0);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[820px] mx-auto px-5">
        {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
        <AdminPageHeader
          kicker="ADMIN · 컨텐츠 발행"
          title="대출·정책자금 직접 추가"
          description="자동 수집 (mss·fsc·kinfa) 이 못 잡는 광역 정책자금·기관 자체 대출을 직접 추가합니다. 매칭 태그는 본문 텍스트에서 자동 추출됩니다."
        />

        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-[13px] text-blue-900 leading-[1.6]">
          💡 <strong>팁</strong>: 대출 한도·이자율·상환 기간은 사용자에게 직접
          노출됩니다. 본문 (description/eligibility) 에 지역명·자격 키워드를
          넣어주세요 — 매칭 태그가 자동 인식됩니다.
        </div>

        {hasPrefill && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-900 leading-[1.6]">
            ✓ <strong>광역 보도자료 자동 채움</strong> — 출처 보도자료에서
            제목·기관·출처 URL·요약을 가져왔습니다. 검토 후 대출 한도·이자율·
            상환기간·신청 방법·마감일을 보강하고 등록하세요.
          </div>
        )}

        <form action={createLoanProgram} className="space-y-6">
          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">필수 정보</h2>
            <div className="space-y-4">
              <Field label="정책명 (title) *" name="title" required maxLength={500} placeholder="예: 전남 소상공인 긴급 운영자금" defaultValue={prefill.title} />
              <Field label="출처 기관 (source) *" name="source" required maxLength={200} placeholder="예: 전라남도청" defaultValue={prefill.source} />
              <Field label="신청 URL (apply_url) *" name="apply_url" required type="url" defaultValue={prefill.apply_url} />

              <label className="block">
                <span className="block text-[13px] font-medium text-grey-700 mb-1">
                  카테고리 (category) *
                </span>
                <select
                  name="category"
                  required
                  defaultValue={
                    (CATEGORIES as readonly string[]).includes(prefill.category)
                      ? prefill.category
                      : ""
                  }
                  className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none"
                >
                  <option value="" disabled>
                    선택…
                  </option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <Textarea
                label="정책 설명 (description) *"
                name="description"
                required
                maxLength={10000}
                rows={6}
                placeholder="대출·자금 사업 상세. 자동 분류용으로 지역명·연령·업종 키워드 자연 포함."
                defaultValue={prefill.description}
              />
            </div>
          </section>

          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">
              대출 조건 (선택)
            </h2>
            <div className="space-y-4">
              <Field label="대출 한도 (loan_amount)" name="loan_amount" maxLength={500} placeholder="예: 최대 5,000만원" defaultValue={prefill.loan_amount} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="이자율 (interest_rate)" name="interest_rate" maxLength={200} placeholder="예: 연 2.0% 고정" defaultValue={prefill.interest_rate} />
                <Field label="상환 기간 (repayment_period)" name="repayment_period" maxLength={200} placeholder="예: 5년 (1년 거치)" defaultValue={prefill.repayment_period} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">
              본문 (선택)
            </h2>
            <div className="space-y-4">
              <Textarea label="대상 (target)" name="target" maxLength={1000} rows={2} placeholder="예: 전남 소재 소상공인" defaultValue={prefill.target} />
              <Textarea label="지원 자격 (eligibility)" name="eligibility" maxLength={5000} rows={3} defaultValue={prefill.eligibility} />
              <Textarea label="신청 방법 (apply_method)" name="apply_method" maxLength={2000} rows={2} defaultValue={prefill.apply_method} />
            </div>
          </section>

          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">
              기간·출처 (선택)
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="신청 시작 (YYYY-MM-DD)" name="apply_start" type="date" defaultValue={prefill.apply_start} />
              <Field label="신청 마감 (YYYY-MM-DD)" name="apply_end" type="date" defaultValue={prefill.apply_end} />
            </div>
            <div className="mt-4">
              <Field label="출처 URL (source_url)" name="source_url" type="url" placeholder="원문 URL" defaultValue={prefill.source_url} />
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="min-h-[48px] px-6 text-[14px] font-bold rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            >
              등록 + 자동 분류
            </button>
            <Link
              href="/admin"
              className="min-h-[48px] px-6 inline-flex items-center text-[14px] font-semibold rounded-lg border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
            >
              취소
            </Link>
            <span className="ml-auto text-[12px] text-grey-600">
              source_code=<code>manual_admin</code> 으로 저장 + 감사 로그 기록
            </span>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  maxLength,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-grey-700 mb-1">
        {label}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue || undefined}
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none"
      />
    </label>
  );
}

function Textarea({
  label,
  name,
  required,
  maxLength,
  rows = 3,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-grey-700 mb-1">
        {label}
      </span>
      <textarea
        name={name}
        required={required}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue || undefined}
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none leading-[1.6] resize-y"
      />
    </label>
  );
}
