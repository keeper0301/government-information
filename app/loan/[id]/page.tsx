import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ad-slot";
import { ShareButton } from "@/components/share-button";
import { BookmarkButton } from "@/components/bookmark-button";
import { RelatedPrograms } from "@/components/related-programs";
import { GovernmentServiceSchema, BreadcrumbSchema, FAQSchema } from "@/components/json-ld";
import { buildPolicyFaqs } from "@/lib/policy-faq";
import { ProgramViewTracker } from "@/components/analytics/program-view-tracker";
import { calcDday, getRelatedPrograms } from "@/lib/programs";
import { isSubstantiallyDuplicate } from "@/lib/utils";
import { LOAN_EXCLUDED_FILTER } from "@/lib/listing-sources";
import { buildPolicyMetaDescription, buildSeoTitle } from "@/lib/policy-title";
import { AdminAutoConfirmBadge } from "@/components/admin/admin-auto-confirm-badge";
import { getPublishedGuide, type EvidenceProgram } from "@/lib/policy/evidence-guide";
import { ApplyActionDetail } from "@/components/policy/apply-action-detail";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import type { Metadata } from "next";

export const revalidate = 3600;

// 2026-06-13 — Next16 정적 ISR 필수 (welfare 상세 검증 패턴, 메모리 isr_dynamic_server_usage).
// force-static 없으면 Supabase fetch 가 정적 렌더와 충돌해 런타임 DYNAMIC_SERVER_USAGE 500.
export const dynamic = "force-static";
export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // 정적 ISR — 공개 메타데이터는 쿠키 없는 admin client(쿠키 접근은 동적 강제).
  const supabase = createAdminClient();
  // AdSense "thin content" 거절 대응 — sparse 페이지는 검수자 sample 에서 빠지도록
  // robots noindex. 대출 핵심 정보 6종 채움 정도로 판정 (page render 와 같은 기준).
  // 원문 대조와 사람 검수가 유효한 설명만 공개 설명으로 인정한다.
  const { data } = await supabase
    .from("loan_programs")
    .select("*")
    .not("source_code", "in", LOAN_EXCLUDED_FILTER)
    .not("is_hidden", "is", true) // 회수(숨김) 정책 제외 — admin client RLS 대체
    .eq("id", id)
    .single();

  if (!data) return { title: "대출 정보 — 정책알리미" };

  const descLen = (data.description || "").length;
  const period = data.apply_start && data.apply_end ? "x" : data.apply_start || data.apply_end || null;
  const summaryFields = [
    data.eligibility,
    data.loan_amount,
    data.interest_rate,
    data.repayment_period,
    period,
    data.apply_method,
  ];
  const filledCount = summaryFields.filter(
    (v) => v && !isSubstantiallyDuplicate(v as string, data.description),
  ).length;
  const metadataGuide = getPublishedGuide(data as unknown as EvidenceProgram);
  const hasInsight = !!metadataGuide;
  // "thin" 임계 — 2026-05-18 AdSense 재거절 후 엄격 강화.
  // 검수된 해설이 없으면 검색 제외 상태를 유지한다.
  const isSparse = !hasInsight;
  void filledCount; void descLen;

  // 2026-06-11 title 정제 + 2026-06-15 CTR 개선 — 마감일이 미래인 정책엔 연도를 앞에 붙여
  // "최신 정보" 신호로 클릭 유도. 검색의도 키워드("지원대상·한도") 부착·잘림 방지는 헬퍼가 처리.
  // today 는 KST(UTC+9) 기준 — UTC 로 하면 한국 0~9시에 어제로 계산돼 만료 직후 정책에
  // 연도가 잠깐 남는다(교차 코드리뷰 P1). 마감 판정의 정확도를 위해 KST 로 고정.
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
  const seoTitle = buildSeoTitle({
    title: data.title,
    applyEnd: data.apply_end,
    today,
    keyword: "지원대상·한도",
    locality: Array.isArray(data.region_tags) ? data.region_tags[0] : null,
  });
  // 검색 설명에도 본문과 동일한 검수 조건을 적용한다.
  // 정부 원문 그대로면 여러 페이지 "동일 설명문 중복"(네이버 진단) + 딱딱해 CTR 낮음 → 해설로
  // 고유화·매력화. 없으면(noindex sparse) 정부 description fallback. 160자 cut(스니펫 권장).
  const metaDescription = buildPolicyMetaDescription({
    title: data.title,
    primary: metadataGuide ? metadataGuide.sections.map(section => section.text).join(" ") : data.description,
    target: data.target || data.eligibility,
    support: [data.loan_amount, data.interest_rate].filter(Boolean).join(" · ") || null,
    applyEnd: data.apply_end,
    source: data.source,
    locality: Array.isArray(data.region_tags) ? data.region_tags[0] : null,
  });
  return {
    title: seoTitle,
    description: metaDescription,
    // 자기참조 canonical — 미지정 시 layout 의 canonical:"/" 를 상속해
    // 모든 상세가 "루트의 중복" 으로 색인 거부됨 (2026-06-05 SC 미색인 진단).
    alternates: { canonical: `/loan/${id}` },
    ...(ADSENSE_REVIEW_MODE || isSparse ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params;
  // 정적 ISR — 공개 정책 데이터는 쿠키 없는 admin client(동적 렌더 강제 방지).
  const supabase = createAdminClient();
  const { data: program } = await supabase
    .from("loan_programs")
    .select("*")
    .not("source_code", "in", LOAN_EXCLUDED_FILTER)
    .not("is_hidden", "is", true) // 회수(숨김) 정책은 404 — admin client RLS 대체
    .eq("id", id)
    .single();

  if (!program) notFound();

  // 2026-06-13 정적 ISR 전환(welfare 상세 동일) — 조회수·북마크·프로필·관리자 판정은 쿠키를
  // 읽어 페이지를 동적으로 만들므로 클라이언트로 이전: view_count→ProgramViewTracker→track route,
  // 북마크·로그인→BookmarkButton self-fetch, 관리자 배지→AdminAutoConfirmBadge. 관련정책 비개인화.
  const dday = calcDday(program.apply_end);
  const applyPeriod =
    program.apply_start || program.apply_end
      ? [program.apply_start, program.apply_end].filter(Boolean).join(" ~ ")
      : null;

  const publishedGuide = getPublishedGuide(program as unknown as EvidenceProgram);
  // 정적 ISR — 관련정책 비개인화(모든 방문자 동일 추천).
  const related = await getRelatedPrograms(
    "loan",
    program.category,
    program.id,
    undefined,
    4,
    null,
  );

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
  // FAQ 구조화 데이터 — 충실한 핵심정보만 Q&A 로 (AI 검색·네이버 이해 보조, 2026-06-15 CTR).
  const faqs = buildPolicyFaqs(filledSummary);

  // 마감 판정 — apply_end 있고 오늘보다 이전이면 "마감됨". null 이면 상시라 마감 아님.
  const today = new Date().toISOString().split("T")[0];
  const isClosed = !!(program.apply_end && program.apply_end < today);

  return (
    <main className="bg-grey-50 pt-28 pb-8">
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
      {faqs.length > 0 && <FAQSchema questions={faqs} />}
      <section className="max-w-content mx-auto px-6 lg:px-10">
        {/* Breadcrumb */}
        <nav className="text-sm text-grey-700 mb-6">
          <Link href="/loan" className="font-medium no-underline hover:text-blue-500 transition-colors">대출·지원금</Link>
          <span className="mx-2 text-grey-600">&gt;</span>
          <span className="text-grey-900 font-medium">{program.title.length > 30 ? program.title.substring(0, 30) + "..." : program.title}</span>
        </nav>

        {/* admin 전용 자동 등록 배지 — 클라이언트에서 admin 판정(정적 ISR 유지). 일반 사용자 렌더 0 */}
        {program.auto_confirm_tier && (
          <AdminAutoConfirmBadge
            table="loan_programs"
            programId={program.id}
            tier={program.auto_confirm_tier as "high" | "mid"}
            isHidden={!!program.is_hidden}
            autoConfirmedAt={program.auto_confirmed_at ?? null}
          />
        )}

        <ProgramViewTracker
          programId={program.id}
          programTable="loan_programs"
          sourcePage={`/loan/${program.id}`}
        />

        <ApplyActionDetail
          kind="loan"
          programId={program.id}
          sourcePage={`/loan/${program.id}`}
          title={program.title}
          target={program.target}
          region={program.region}
          district={program.district}
          source={program.source}
          sourceUrl={program.source_url}
          updatedAt={program.updated_at}
          eligibility={program.eligibility}
          benefits={null}
          loanAmount={program.loan_amount}
          interestRate={program.interest_rate}
          applyMethod={program.apply_method}
          applyUrl={program.apply_url}
          applyStart={program.apply_start}
          applyEnd={program.apply_end}
          contactInfo={program.contact_info}
          description={program.description}
          detailedContent={program.detailed_content}
          selectionCriteria={null}
          requiredDocuments={program.required_documents}
          repaymentPeriod={program.repayment_period}
          dday={dday}
          isClosed={isClosed}
          guide={publishedGuide}
          reviewCheckedAt={publishedGuide?.source.checkedAt ?? null}
          reviewReviewedAt={publishedGuide?.reviewedAt ?? null}
        />

        <div className="mb-8 mt-4 flex flex-wrap items-center gap-3">
          <ShareButton />
          <BookmarkButton programType="loan" programId={program.id} />
          <Link
            href={`/loan/${program.id}/draft`}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-blue-50 px-5 text-[15px] font-semibold text-blue-700 no-underline"
          >
            Pro 신청서 초안
          </Link>
        </div>

        <RelatedPrograms programs={related} />
        <p className="mt-8 mb-4 text-[12px] leading-[1.6] text-grey-500">
          정보는 자동 수집·정리된 안내입니다. 최종 신청 조건은 공식 기관 공고에서 다시 확인하세요.
        </p>
      </section>

      {/* Ad */}
      <div className="mt-12">
        <AdSlot placement="detail" />
      </div>
    </main>
  );
}
