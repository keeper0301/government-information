import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ad-slot";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
};

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex py-3 border-b border-grey-100 last:border-b-0">
      <dt className="w-28 shrink-0 text-sm font-medium text-grey-500">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-grey-900 whitespace-pre-line">
        {value}
      </dd>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("loan_programs")
    .select("title, description")
    .eq("id", id)
    .single();

  if (!data) return { title: "대출 정보" };
  return {
    title: `${data.title} | 정책알리미`,
    description: data.description || undefined,
  };
}

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("loan_programs")
    .select("*")
    .eq("id", id)
    .single();

  if (!program) notFound();

  // Format apply period
  const applyPeriod =
    program.apply_start || program.apply_end
      ? [program.apply_start, program.apply_end].filter(Boolean).join(" ~ ")
      : null;

  return (
    <main className="pt-28 pb-20">
      <section className="max-w-content mx-auto px-10 max-md:px-6">
        {/* Back link */}
        <a
          href="/loan"
          className="inline-flex items-center gap-1 text-sm text-grey-500 no-underline hover:text-grey-700 transition-colors mb-6"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          목록으로
        </a>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-600">
              {program.category}
            </span>
            {program.target && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-grey-100 text-grey-600">
                {program.target}
              </span>
            )}
          </div>
          <h1 className="text-[24px] font-bold tracking-[-0.6px] text-grey-900 mb-2">
            {program.title}
          </h1>
          {program.description && (
            <p className="text-[15px] text-grey-600 leading-[1.6] whitespace-pre-line">
              {program.description}
            </p>
          )}
        </div>

        {/* Info table */}
        <dl className="mb-8">
          <InfoRow label="자격 요건" value={program.eligibility} />
          <InfoRow label="대출 한도" value={program.loan_amount} />
          <InfoRow label="금리" value={program.interest_rate} />
          <InfoRow label="상환 조건" value={program.repayment_period} />
          <InfoRow label="신청 방법" value={program.apply_method} />
          <InfoRow label="신청 기간" value={applyPeriod} />
          <InfoRow label="출처" value={program.source} />
        </dl>

        {/* Apply button */}
        {program.apply_url && (
          <a
            href={program.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white bg-blue-500 rounded-xl no-underline hover:bg-blue-600 transition-colors"
          >
            신청하러 가기
          </a>
        )}
      </section>

      {/* Ad */}
      <div className="mt-12">
        <AdSlot />
      </div>
    </main>
  );
}
