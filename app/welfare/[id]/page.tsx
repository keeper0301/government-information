import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("welfare_programs").select("title, description").eq("id", id).single();
  if (!data) return { title: "복지 정보 — 정책알리미" };
  return {
    title: `${data.title} — 정책알리미`,
    description: data.description || undefined,
  };
}

function calcDday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="py-4 border-b border-grey-100 last:border-b-0">
      <div className="text-[13px] font-medium text-grey-500 mb-1.5">{label}</div>
      <div className="text-[15px] text-grey-900 leading-[1.6] whitespace-pre-line">{value}</div>
    </div>
  );
}

export default async function WelfareDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("welfare_programs")
    .select("*")
    .eq("id", id)
    .single();

  if (!program) notFound();

  const dday = calcDday(program.apply_end);
  const period = program.apply_start && program.apply_end
    ? `${program.apply_start} ~ ${program.apply_end}`
    : program.apply_start
    ? `${program.apply_start} ~`
    : program.apply_end
    ? `~ ${program.apply_end}`
    : null;

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      {/* Back */}
      <a href="/welfare" className="text-sm text-grey-500 no-underline hover:text-blue-500 transition-colors mb-6 inline-block">
        &larr; 복지 정보 목록
      </a>

      {/* Badges */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-600">
          {program.category}
        </span>
        {program.target && (
          <span className="text-[13px] font-semibold px-2.5 py-1 rounded-md bg-grey-100 text-grey-600">
            {program.target}
          </span>
        )}
        {program.region && program.region !== "전국" && (
          <span className="text-[13px] font-semibold px-2.5 py-1 rounded-md bg-grey-100 text-grey-600">
            {program.region}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-[32px] font-bold tracking-[-1.2px] text-grey-900 mb-3 max-md:text-[24px]">
        {program.title}
      </h1>

      {/* D-day + Source */}
      <div className="flex items-center gap-3 mb-8">
        {dday !== null && (
          <span className={`text-sm font-bold px-2.5 py-1 rounded-md ${dday <= 7 ? "bg-[#FFEEEE] text-red" : "bg-blue-50 text-blue-600"}`}>
            D-{dday}
          </span>
        )}
        {dday === null && !program.apply_end && (
          <span className="text-sm font-bold px-2.5 py-1 rounded-md bg-grey-100 text-grey-600">상시</span>
        )}
        <span className="text-sm text-grey-500">{program.source}</span>
      </div>

      {/* Description */}
      {program.description && (
        <p className="text-base text-grey-700 leading-[1.7] mb-8 max-w-[700px]">
          {program.description}
        </p>
      )}

      {/* Detail card */}
      <div className="bg-grey-50 rounded-2xl p-8 mb-8 max-md:p-6">
        <InfoRow label="자격 요건" value={program.eligibility} />
        <InfoRow label="혜택 내용" value={program.benefits} />
        <InfoRow label="신청 방법" value={program.apply_method} />
        <InfoRow label="신청 기간" value={period} />
        <InfoRow label="출처" value={program.source} />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {program.apply_url && (
          <a
            href={program.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-600 transition-colors"
          >
            신청하기
          </a>
        )}
        <button
          className="px-6 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl border-none cursor-pointer hover:bg-grey-200 transition-colors font-pretendard"
        >
          알림 받기
        </button>
      </div>
    </main>
  );
}
