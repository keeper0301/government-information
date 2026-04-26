import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ad-slot";
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

  // 로그인 여부 + 북마크 상태 — BookmarkButton 초기 상태 hydration 용
  const { data: { user } } = await supabase.auth.getUser();
  const initialBookmarked = user ? await isBookmarked("loan", id) : false;

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

  // 데이터 빈약도 판정 — 본문 길이 + 핵심 정보 카드 채움 정도로 분류.
  // very-sparse: 본문도 짧고(≤100자) 핵심 정보도 거의 없음(≤1)
  // sparse:      핵심 정보가 거의 없음(≤1) — 본문은 있으니 카드 위에 가벼운 안내
  // normal:      안내 노출 안 함
  const descLen = (program.description || "").length;
  const sparseVariant: "very-sparse" | "sparse" | null =
    filledSummary.length <= 1 && descLen <= 100
      ? "very-sparse"
      : filledSummary.length <= 1
      ? "sparse"
      : null;

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
      <BreadcrumbSchema
        items={[
          { name: "홈", url: process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com" },
          { name: "대출정보", url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/loan` },
          { name: program.title, url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}/loan/${program.id}` },
        ]}
      />
      <section className="max-w-content mx-auto px-10 max-md:px-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-grey-700 mb-6">
          <Link href="/loan" className="font-medium no-underline hover:text-blue-500 transition-colors">대출·지원금</Link>
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

        {/* 빈약 안내 박스 — 카드가 비어 있을 때 "원문에 더 풍부" 안내 (카드 위 배치).
            재구성 후에도 카드 바로 위 자리 유지 — 사용자가 빈 카드 보고 답답해지기 전에
            맥락 제공. */}
        {sparseVariant && (
          <SparseDataNotice
            sourceLink={sourceLink}
            source={program.source}
            variant={sparseVariant}
          />
        )}

        {/* 핵심 정보 카드 — 상세 페이지 최상단 (본문 description 위로 이동).
            "내가 받을 수 있는가" 를 3초 안에 판단할 수 있도록 스크롤 없이 노출.
            채워진 필드가 1개 이상일 때만 카드 자체를 렌더. */}
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

        {/* 출처 고지 — 핵심 정보 바로 아래로 이동 (사용자 요청).
            "이 정보가 어디서 왔고 언제 갱신됐는지" 를 카드 직후 노출해 신뢰 맥락 제공. */}
        <div className="bg-white border border-grey-200 rounded-xl px-6 py-4 mb-6">
          <div className="text-[14px] font-semibold text-grey-900 mb-0.5">출처: {program.source}</div>
          <div className="text-[13px] text-grey-700">
            마지막 업데이트: {new Date(program.updated_at).toLocaleDateString("ko-KR")}
            {" · "}본 내용은 원문을 자동 수집한 것입니다.
          </div>
        </div>

        {/* Description — 카드 아래로 이동 + stripCardDuplicates 로 카드와 중복되는
            "라벨: 값" 라인 제거. 페이지 배경(크림) 과 구별되도록 흰 카드로 감싸
            공고 본문 덩어리를 시각적으로 분리. 결과가 빈 문자열이면 블록 생략. */}
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

        {/* 상세 정보 섹션들 — detailed_content 등은 그대로. HTML 엔티티 정제 유지. */}
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

        {/* Action buttons — 콘텐츠 전체(핵심 정보·본문·상세 섹션) 를 다 살펴본 뒤
            "이제 신청하러 갈래?" 로 이어지는 최종 CTA. 3단 분기 유지. */}
        <div className="flex items-center gap-3 flex-wrap mb-10 mt-6">
          {program.apply_url && isDeepLink(program.apply_url) ? (
            <a
              href={program.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 text-[15px] font-semibold text-white bg-blue-500 rounded-xl no-underline hover:bg-blue-600 transition-colors"
            >
              신청하러 가기
            </a>
          ) : program.apply_url ? (
            <a
              href={program.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 text-[15px] font-semibold text-grey-700 bg-grey-100 rounded-xl no-underline hover:bg-grey-200 transition-colors"
            >
              {program.source} 홈페이지 방문
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
          <BookmarkButton
            programType="loan"
            programId={program.id}
            initialBookmarked={initialBookmarked}
            isLoggedIn={!!user}
          />
          <ShareButton />
          {/* Pro 신청서 초안 — loan 은 자영업자 wedge 핵심 진입.
              비Pro 는 server 가드가 /pricing 으로 redirect (ISR 유지). */}
          <Link
            href={`/loan/${program.id}/draft`}
            className="px-6 py-3 bg-blue-50 text-blue-700 text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-100 transition-colors inline-flex items-center gap-1.5"
          >
            📄 Pro 신청서 초안
          </Link>
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
