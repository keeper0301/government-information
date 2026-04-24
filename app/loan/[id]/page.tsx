import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ad-slot";
import { AlarmButton } from "@/components/alarm-button";
import { ShareButton } from "@/components/share-button";
import { InfoSection } from "@/components/info-section";
import { RelatedPrograms } from "@/components/related-programs";
import { GovernmentServiceSchema } from "@/components/json-ld";
import { SummaryItem } from "@/components/summary-item";
import { calcDday, getRelatedPrograms } from "@/lib/programs";
import { cleanDescription, isSubstantiallyDuplicate } from "@/lib/utils";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("loan_programs")
    .select("title, description")
    .eq("id", id)
    .single();

  if (!data) return { title: "대출 정보 — 정책알리미" };
  return {
    title: `${data.title} — 정책알리미`,
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

  // 조회수 증가 (fire-and-forget)
  supabase.rpc("increment_view_count", { p_table_name: "loan_programs", p_row_id: id })
    .then(({ error }) => { if (error) console.error("view count error:", error); });

  const dday = calcDday(program.apply_end);
  const applyPeriod =
    program.apply_start || program.apply_end
      ? [program.apply_start, program.apply_end].filter(Boolean).join(" ~ ")
      : null;

  const sourceLink = program.source_url || program.apply_url;
  const related = await getRelatedPrograms("loan", program.category, program.id);

  // 핵심 정보 필드 6종 — value 있고, 본문 description 과 사실상 같지 않은 것만 골라 표시.
  // 실측: 대출 411건의 eligibility 가 100% description 복붙. 그대로 두면 본문이 두 번
  // 노출돼 사용자가 "왜 같은 내용을 또 보여주지?" 하게 됨. 자동 중복 검사로 차단.
  const summaryFields: { label: string; value: string | null }[] = [
    { label: "자격 요건", value: program.eligibility },
    { label: "대출 한도", value: program.loan_amount },
    { label: "금리", value: program.interest_rate },
    { label: "상환 조건", value: program.repayment_period },
    { label: "신청 기간", value: applyPeriod },
    { label: "신청 방법", value: program.apply_method },
  ];
  const filledSummary = summaryFields.filter(
    (f) => f.value && !isSubstantiallyDuplicate(f.value, program.description),
  );

  const hasDetailedData = !!(program.detailed_content || program.eligibility || program.contact_info);

  // 마감 판정 — apply_end 있고 오늘보다 이전이면 "마감됨". null 이면 상시라 마감 아님.
  const today = new Date().toISOString().split("T")[0];
  const isClosed = !!(program.apply_end && program.apply_end < today);

  return (
    <main className="pt-28 pb-20">
      <GovernmentServiceSchema
        name={program.title}
        description={program.description || ""}
        url={`${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/loan/${program.id}`}
        provider={program.source}
        category={program.category}
      />
      <section className="max-w-content mx-auto px-10 max-md:px-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-grey-700 mb-6">
          <a href="/loan" className="font-medium no-underline hover:text-blue-500 transition-colors">대출·지원금</a>
          <span className="mx-2 text-grey-600">&gt;</span>
          <span className="text-grey-900 font-medium">{program.title.length > 30 ? program.title.substring(0, 30) + "..." : program.title}</span>
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
            <span className="text-sm font-bold px-2.5 py-1 rounded-md bg-grey-100 text-grey-700">상시</span>
          )}
          <span className="text-sm font-medium text-grey-700">{program.source}</span>
          {program.view_count > 0 && (
            <span className="text-sm text-grey-600">조회 {program.view_count.toLocaleString()}회</span>
          )}
        </div>

        {/* 마감 공고 경고 배너 — apply_end 가 지난 공고 */}
        {isClosed && (
          <div className="bg-[#FFEEEE] border border-red/30 rounded-xl px-5 py-4 mb-6 text-[14px] text-red leading-[1.6] font-medium">
            <span className="font-bold">⚠ 이 공고는 신청이 마감됐습니다</span>
            {program.apply_end && (
              <span className="font-normal"> · 마감일: {program.apply_end}</span>
            )}
          </div>
        )}

        {/* Description — HTML 엔티티·태그 제거 후 섹션 단위 줄바꿈 살려서 렌더.
            whitespace-pre-wrap 이 cleanDescription 이 삽입한 \n 을 실제 줄바꿈으로 표시. */}
        {program.description && (
          <p className="text-[16px] font-medium text-grey-900 leading-[1.75] mb-10 max-w-[760px] max-md:text-[15px] whitespace-pre-wrap">
            {cleanDescription(program.description)}
          </p>
        )}

        {/* 핵심 정보 카드 — 채워진 필드가 1개 이상일 때만 노출
            (기존엔 NULL 필드에 "원문에서 확인하기" 5개 반복 → 무성의해 보임) */}
        {filledSummary.length > 0 && (
          <div className="bg-white border border-grey-200 rounded-2xl p-8 mb-8 max-md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h2 className="text-[17px] font-bold text-grey-900 mb-2 tracking-[-0.3px]">핵심 정보</h2>
            <div className="grid grid-cols-2 gap-x-10 max-md:grid-cols-1 divide-y divide-grey-100 md:divide-y-0">
              {filledSummary.map((f) => (
                <SummaryItem key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
          </div>
        )}

        {/* 데이터 부족 안내 — 상세 필드가 거의 없으면 원문 CTA 를 크고 명확하게.
            핵심 정보 카드를 숨기는 대신 이 박스 하나로 사용자를 원문으로 안내 */}
        {!hasDetailedData && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-6 mb-8">
            <div className="text-[15px] font-bold text-grey-900 mb-1">
              자격·한도·금리 등 세부 정보는 원문에서 확인할 수 있어요
            </div>
            <p className="text-[13px] text-grey-700 leading-[1.6] mb-4">
              이 공고는 요약 정보만 수집된 상태입니다. 정확한 신청 조건과 절차는
              기관 원문 페이지에서 확인해 주세요.
            </p>
            {sourceLink ? (
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-500 text-white text-[14px] font-semibold rounded-lg no-underline hover:bg-blue-600 transition-colors"
              >
                원문 페이지 열기
                <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <span className="text-[13px] text-grey-600">
                원문 링크가 수집되지 않았어요. 기관에 직접 문의해 주세요.
              </span>
            )}
          </div>
        )}

        {/* 상세 정보 섹션들 — 모두 cleanDescription 으로 정제 후 렌더
            (detailed_content · required_documents · contact_info 역시 스크래퍼가
            HTML 엔티티 포함한 원문을 저장해두는 경우 많음) */}
        {program.detailed_content && (
          <InfoSection title="상세 내용">
            {cleanDescription(program.detailed_content)}
          </InfoSection>
        )}

        {program.required_documents && (
          <InfoSection title="필요 서류">
            {cleanDescription(program.required_documents)}
          </InfoSection>
        )}

        {program.contact_info && (
          <InfoSection title="문의처">
            {cleanDescription(program.contact_info)}
          </InfoSection>
        )}

        {/* 출처 안내 */}
        <div className="bg-white border border-grey-200 rounded-xl px-6 py-5 mb-8">
          <div className="text-[14px] font-semibold text-grey-900 mb-1">출처: {program.source}</div>
          <div className="text-[12px] text-grey-700">
            마지막 업데이트: {new Date(program.updated_at).toLocaleDateString("ko-KR")}
            {" · "}본 내용은 원문을 자동 수집한 것입니다.
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          {program.apply_url ? (
            <a
              href={program.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 text-[15px] font-semibold text-white bg-blue-500 rounded-xl no-underline hover:bg-blue-600 transition-colors"
            >
              신청하러 가기
            </a>
          ) : (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(program.source + ' ' + program.title + ' 신청')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 text-[15px] font-semibold text-grey-700 bg-grey-100 rounded-xl no-underline hover:bg-grey-200 transition-colors"
            >
              {program.source}에서 신청 방법 찾기
            </a>
          )}
          <AlarmButton programId={program.id} programType="loan" />
          <ShareButton />
        </div>

        {/* Related Programs */}
        <RelatedPrograms programs={related} />
      </section>

      {/* Ad */}
      <div className="mt-12">
        <AdSlot />
      </div>
    </main>
  );
}
