import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AlarmButton } from "@/components/alarm-button";
import { ShareButton } from "@/components/share-button";
import { BookmarkButton } from "@/components/bookmark-button";
import { isBookmarked } from "@/lib/bookmarks";
import { InfoSection } from "@/components/info-section";
import { RelatedPrograms } from "@/components/related-programs";
import { GovernmentServiceSchema, BreadcrumbSchema } from "@/components/json-ld";
import { SummaryItem } from "@/components/summary-item";
import { SparseDataNotice } from "@/components/sparse-data-notice";
import { calcDday, getRelatedPrograms } from "@/lib/programs";
import { cleanDescription, isSubstantiallyDuplicate, stripCardDuplicates } from "@/lib/utils";
import { isDeepLink } from "@/lib/utils/apply-url";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("welfare_programs").select("title, description").eq("id", id).single();
  if (!data) return { title: "복지 지원사업 — 정책알리미" };
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

  // 로그인 여부 + 북마크 상태 — BookmarkButton 초기 상태 hydration 용
  const { data: { user } } = await supabase.auth.getUser();
  const initialBookmarked = user ? await isBookmarked("welfare", id) : false;

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

  // 핵심 정보 4종 — value 있고, 본문 description 과 사실상 같지 않은 것만 표시.
  // (대출과 달리 복지는 다른 데이터 소스라 중복 비율 0% 였지만, 동일 가드로 통일.)
  const summaryFields: { label: string; value: string | null }[] = [
    { label: "자격 요건", value: program.eligibility },
    { label: "혜택 내용", value: program.benefits },
    { label: "신청 기간", value: period },
    { label: "신청 방법", value: program.apply_method },
  ];
  const filledSummary = summaryFields.filter(
    (f) => f.value && !isSubstantiallyDuplicate(f.value, program.description),
  );

  // 데이터 빈약도 판정 — 본문 길이 + 핵심 정보 카드 채움 정도로 분류 (loan 과 동일).
  const descLen = (program.description || "").length;
  const sparseVariant: "very-sparse" | "sparse" | null =
    filledSummary.length <= 1 && descLen <= 100
      ? "very-sparse"
      : filledSummary.length <= 1
      ? "sparse"
      : null;

  // 마감 판정 — apply_end 있고 오늘보다 이전이면 "마감됨"
  const today = new Date().toISOString().split("T")[0];
  const isClosed = !!(program.apply_end && program.apply_end < today);

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <GovernmentServiceSchema
        name={program.title}
        description={program.description || ""}
        url={`${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/welfare/${program.id}`}
        provider={program.source}
        category={program.category}
      />
      <BreadcrumbSchema
        items={[
          { name: "홈", url: process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com" },
          { name: "복지정보", url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/welfare` },
          { name: program.title, url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/welfare/${program.id}` },
        ]}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-grey-700 mb-6">
        <Link href="/welfare" className="font-medium no-underline hover:text-blue-500 transition-colors">복지 지원사업</Link>
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
          <span className="text-sm font-bold px-2.5 py-1 rounded-md bg-grey-100 text-grey-700">상시</span>
        )}
        <span className="text-sm font-medium text-grey-700">{program.source}</span>
        {program.view_count > 0 && (
          <span className="text-sm text-grey-600">조회 {program.view_count.toLocaleString()}회</span>
        )}
      </div>

      {/* 마감 공고 경고 배너 */}
      {isClosed && (
        <div className="bg-[#FFEEEE] border border-red/30 rounded-xl px-5 py-4 mb-6 text-[14px] text-red leading-[1.6] font-medium">
          <span className="font-bold">⚠ 이 공고는 신청이 마감됐습니다</span>
          {program.apply_end && (
            <span className="font-normal"> · 마감일: {program.apply_end}</span>
          )}
        </div>
      )}

      {/* 빈약 안내 박스 — 카드 위 배치 유지 (loan 과 동일). */}
      {sparseVariant && (
        <SparseDataNotice
          sourceLink={sourceLink}
          source={program.source}
          variant={sparseVariant}
        />
      )}

      {/* 핵심 정보 카드 — 페이지 최상단 (description 위). 자격·혜택·기간·방법을 먼저 보여줘
          "내가 받을 수 있는가" 판단을 즉시 가능케 함. */}
      {filledSummary.length > 0 && (
        <div className="bg-white border border-grey-200 rounded-2xl p-8 mb-4 max-md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <h2 className="text-[17px] font-bold text-grey-900 mb-2 tracking-[-0.3px]">핵심 정보</h2>
          <div className="grid grid-cols-2 gap-x-10 max-md:grid-cols-1 divide-y divide-grey-100 md:divide-y-0">
            {filledSummary.map((f) => (
              <SummaryItem key={f.label} label={f.label} value={f.value} />
            ))}
          </div>
        </div>
      )}

      {/* 출처 고지 — 핵심 정보 바로 아래 (loan 과 동일). */}
      <div className="bg-white border border-grey-200 rounded-xl px-6 py-4 mb-6">
        <div className="text-[14px] font-semibold text-grey-900 mb-0.5">출처: {program.source}</div>
        <div className="text-[13px] text-grey-700">
          마지막 업데이트: {new Date(program.updated_at).toLocaleDateString("ko-KR")}
          {" · "}본 내용은 원문을 자동 수집한 것입니다.
        </div>
      </div>

      {/* Description — 흰 카드로 감싸 배경과 구분. 카드 중복 라인 제거. 결과 비면 생략. */}
      {(() => {
        const cleaned = stripCardDuplicates(cleanDescription(program.description));
        if (!cleaned) return null;
        return (
          <div className="bg-white border border-grey-200 rounded-2xl p-8 mb-8 max-md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h2 className="text-[17px] font-bold text-grey-900 mb-4 tracking-[-0.3px]">공고 내용</h2>
            <p className="text-[16px] font-medium text-grey-800 leading-[1.8] max-md:text-[15px] whitespace-pre-wrap">
              {cleaned}
            </p>
          </div>
        );
      })()}

      {/* 상세 정보 섹션들 — 그대로 유지 */}
      {program.detailed_content && (
        <InfoSection title="상세 내용">
          {cleanDescription(program.detailed_content)}
        </InfoSection>
      )}

      {program.selection_criteria && (
        <InfoSection title="선정 기준">
          {cleanDescription(program.selection_criteria)}
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

      {/* Action buttons — 콘텐츠 전체를 본 뒤 최종 CTA. 3단 분기 유지. */}
      <div className="flex gap-3 flex-wrap mb-10 mt-6">
        {program.apply_url && isDeepLink(program.apply_url) ? (
          <a
            href={program.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-600 transition-colors"
          >
            신청하기
          </a>
        ) : program.apply_url ? (
          <a
            href={program.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl no-underline hover:bg-grey-200 transition-colors"
          >
            {program.source} 홈페이지 방문
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
        <BookmarkButton
          programType="welfare"
          programId={program.id}
          initialBookmarked={initialBookmarked}
          isLoggedIn={!!user}
        />
        <ShareButton />
      </div>

      {/* Related Programs */}
      <RelatedPrograms programs={related} />
    </main>
  );
}
