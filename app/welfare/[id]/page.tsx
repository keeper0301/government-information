import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AlarmButton } from "@/components/alarm-button";
import { ShareButton } from "@/components/share-button";
import { InfoSection } from "@/components/info-section";
import { RelatedPrograms } from "@/components/related-programs";
import { GovernmentServiceSchema } from "@/components/json-ld";
import { SummaryItem } from "@/components/summary-item";
import { calcDday, getRelatedPrograms } from "@/lib/programs";
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

export default async function WelfareDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("welfare_programs")
    .select("*")
    .eq("id", id)
    .single();

  if (!program) notFound();

  // 조회수 증가 (fire-and-forget)
  supabase.rpc("increment_view_count", { p_table_name: "welfare_programs", p_row_id: id })
    .then(({ error }) => { if (error) console.error("view count error:", error); });

  const dday = calcDday(program.apply_end);
  const period = program.apply_start && program.apply_end
    ? `${program.apply_start} ~ ${program.apply_end}`
    : program.apply_start
    ? `${program.apply_start} ~`
    : program.apply_end
    ? `~ ${program.apply_end}`
    : null;

  const sourceLink = program.source_url || program.apply_url;
  const related = await getRelatedPrograms("welfare", program.category, program.id, program.region);

  // 데이터 풍부도 판단
  const hasDetailedData = !!(program.detailed_content || program.selection_criteria || program.eligibility || program.contact_info);

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <GovernmentServiceSchema
        name={program.title}
        description={program.description || ""}
        url={`${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/welfare/${program.id}`}
        provider={program.source}
        category={program.category}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-grey-500 mb-6">
        <a href="/welfare" className="no-underline hover:text-blue-500 transition-colors">복지 정보</a>
        <span className="mx-2">&gt;</span>
        <span className="text-grey-700">{program.title.length > 30 ? program.title.substring(0, 30) + "..." : program.title}</span>
      </nav>

      {/* Badges */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
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

      {/* D-day + Source + View count */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {dday !== null && (
          <span className={`text-sm font-bold px-2.5 py-1 rounded-md ${dday <= 7 ? "bg-[#FFEEEE] text-red" : "bg-blue-50 text-blue-600"}`}>
            D-{dday}
          </span>
        )}
        {dday === null && !program.apply_end && (
          <span className="text-sm font-bold px-2.5 py-1 rounded-md bg-grey-100 text-grey-600">상시</span>
        )}
        <span className="text-sm text-grey-500">{program.source}</span>
        {program.view_count > 0 && (
          <span className="text-sm text-grey-400">조회 {program.view_count.toLocaleString()}회</span>
        )}
      </div>

      {/* Description */}
      {program.description && (
        <p className="text-base text-grey-700 leading-[1.7] mb-8 max-w-[700px]">
          {program.description}
        </p>
      )}

      {/* 데이터 부족 안내 */}
      {!hasDetailedData && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-8 text-[14px] text-blue-700 leading-[1.6]">
          이 프로그램은 요약 정보만 수집된 상태입니다. 상세 내용은{" "}
          {sourceLink ? (
            <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              원문 페이지
            </a>
          ) : (
            "원문"
          )}
          를 확인해 주세요.
        </div>
      )}

      {/* 핵심 정보 카드 */}
      <div className="bg-grey-50 rounded-2xl p-8 mb-8 max-md:p-6">
        <h2 className="text-base font-bold text-grey-900 mb-4">핵심 정보</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-md:grid-cols-1">
          <SummaryItem label="자격 요건" value={program.eligibility} fallbackUrl={sourceLink} />
          <SummaryItem label="혜택 내용" value={program.benefits} fallbackUrl={sourceLink} />
          <SummaryItem label="신청 기간" value={period} fallbackUrl={sourceLink} />
          <SummaryItem label="신청 방법" value={program.apply_method} fallbackUrl={sourceLink} />
        </div>
      </div>

      {/* 상세 정보 섹션들 */}
      {program.detailed_content && (
        <InfoSection title="상세 내용">
          {program.detailed_content}
        </InfoSection>
      )}

      {program.selection_criteria && (
        <InfoSection title="선정 기준">
          {program.selection_criteria}
        </InfoSection>
      )}

      {program.required_documents && (
        <InfoSection title="필요 서류">
          {program.required_documents}
        </InfoSection>
      )}

      {program.contact_info && (
        <InfoSection title="문의처">
          {program.contact_info}
        </InfoSection>
      )}

      {/* 출처 안내 */}
      <div className="bg-grey-50 rounded-xl px-6 py-5 mb-8">
        <div className="text-sm font-medium text-grey-900 mb-1">출처: {program.source}</div>
        <div className="text-xs text-grey-400">
          마지막 업데이트: {new Date(program.updated_at).toLocaleDateString("ko-KR")}
          {" · "}본 내용은 원문을 자동 수집한 것입니다.
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap mb-4">
        {program.apply_url ? (
          <a
            href={program.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-600 transition-colors"
          >
            신청하기
          </a>
        ) : (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(program.source + ' ' + program.title + ' 신청')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl no-underline hover:bg-grey-200 transition-colors"
          >
            {program.source}에서 신청 방법 찾기
          </a>
        )}
        <AlarmButton programId={program.id} programType="welfare" />
        <ShareButton />
      </div>

      {/* Related Programs */}
      <RelatedPrograms programs={related} />
    </main>
  );
}
