import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { ShareButton } from "@/components/share-button";
import { RelatedPrograms } from "@/components/related-programs";
import { GovernmentServiceSchema, BreadcrumbSchema, FAQSchema } from "@/components/json-ld";
import { ProgramViewTracker } from "@/components/analytics/program-view-tracker";
import { BookmarkButton } from "@/components/bookmark-button";
import { calcDday, getRelatedPrograms } from "@/lib/programs";
import { isSubstantiallyDuplicate } from "@/lib/utils";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";
import { buildPolicyMetaDescription, buildSeoTitle } from "@/lib/policy-title";
import { AdminAutoConfirmBadge } from "@/components/admin/admin-auto-confirm-badge";
import { getPublishedGuide, type EvidenceProgram } from "@/lib/policy/evidence-guide";
import { ApplyActionDetail } from "@/components/policy/apply-action-detail";
import { buildPolicyFaqs } from "@/lib/policy-faq";
import { isPolicySearchPublic } from "@/lib/search-publication";
import type { Metadata } from "next";

export const revalidate = 3600;

// 2026-06-13 — Next16 정적 ISR 필수 설정 (region 페이지 검증된 패턴).
// force-static: 프리렌더 강제 + 데이터 캐시 + cookies/headers/useSearchParams 를 빈 값
//   반환(throw 대신). 이게 없으면 Supabase fetch(no-store 류)가 정적 렌더와 충돌해
//   런타임 첫 요청에서 DYNAMIC_SERVER_USAGE 500 발생(2026-06-13 사고 — Next docs
//   incremental-static-regeneration.md L576 + caching-without-cache-components.md L104).
export const dynamic = "force-static";
// generateStaticParams [] = 빌드 prebuild 0, 모든 id 는 on-demand 첫 요청 렌더 후 revalidate(1h)
//   CDN 캐시(ISR). dynamicParams 기본 true 라 신규 id 도 정상 처리(region 은 false=닫힌집합).
export async function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // 정적 ISR 유지 — 공개 메타데이터는 쿠키 없는 admin client 로 조회(createClient 쿠키
  // 접근은 라우트를 동적으로 강제해 캐시를 깬다).
  const supabase = createAdminClient();
  // AdSense "thin content" 거절 대응 — sparse 페이지는 검수자 sample 에서 빠지도록
  // robots noindex. 본문 + 핵심 정보 카드 채움 정도로 판정 (page render 와 같은 기준).
  // 원문 대조와 사람 검수가 유효한 설명만 공개 설명으로 인정한다.
  const { data } = await supabase
    .from("welfare_programs")
    .select("*")
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .not("is_hidden", "is", true) // 회수(숨김) 정책 제외 — admin client 라 RLS 대체 명시
    .eq("id", id)
    .single();
  if (!data) return { title: "복지 지원사업 — 정책알리미" };

  const descLen = (data.description || "").length;
  const period = data.apply_start && data.apply_end ? "x" : data.apply_start || data.apply_end || null;
  const summaryFields = [data.eligibility, data.benefits, period, data.apply_method];
  const filledCount = summaryFields.filter((v) => v && !isSubstantiallyDuplicate(v as string, data.description)).length;
  const metadataGuide = getPublishedGuide(data as unknown as EvidenceProgram);
  const hasInsight = !!metadataGuide;
  // "thin" 임계 — 2026-05-18 AdSense 재거절 후 엄격 강화.
  // 검수된 해설이 없으면 검색 제외 상태를 유지한다.
  // filledCount/descLen 충실 보조 조건은 폐기 — AdSense "low value content" 정책상
  // 정부 데이터 가공만으로는 부가가치 불충분 판정. 백필 완료 row 만 index.
  const isSparse = !hasInsight;
  // 회귀 감시: filledCount/descLen 도 함께 기록 (admin/insight-progress 진단용).
  void filledCount; void descLen;

  // 2026-06-11 title 정제 + 2026-06-15 CTR 개선 — 마감일이 미래인 정책엔 연도를 앞에 붙여
  // "최신 정보" 신호로 클릭 유도. 검색의도 키워드("신청자격·방법") 부착·잘림 방지는 헬퍼가 처리.
  // today 는 KST(UTC+9) 기준 — UTC 로 하면 한국 0~9시에 어제로 계산돼 만료 직후 정책에
  // 연도가 잠깐 남는다(교차 코드리뷰 P1). 마감 판정의 정확도를 위해 KST 로 고정.
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
  const seoTitle = buildSeoTitle({
    title: data.title,
    applyEnd: data.apply_end,
    today,
    keyword: "신청자격·방법",
    locality: data.region,
  });
  // 검색 설명에도 본문과 동일한 검수 조건을 적용한다.
  // 정부 원문 그대로면 여러 페이지 "동일 설명문 중복"(네이버 진단) + 딱딱해 CTR 낮음 → 해설로
  // 고유화·매력화. 없으면(noindex sparse) 정부 description fallback. 160자 cut(스니펫 권장).
  const metaDescription = buildPolicyMetaDescription({
    title: data.title,
    primary: metadataGuide ? metadataGuide.sections.map(section => section.text).join(" ") : data.description,
    target: data.target || data.eligibility,
    support: data.benefits,
    applyEnd: data.apply_end,
    source: data.source,
    locality: data.region,
  });
  return {
    title: seoTitle,
    description: metaDescription,
    // 자기참조 canonical — 미지정 시 layout 의 canonical:"/" 를 상속해
    // 모든 상세가 "루트의 중복" 으로 색인 거부됨 (2026-06-05 SC 미색인 진단).
    alternates: { canonical: `/welfare/${id}` },
    ...(isSparse || !isPolicySearchPublic(data as unknown as EvidenceProgram) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function WelfareDetailPage({ params }: Props) {
  const { id } = await params;
  // 정적 ISR — 공개 정책 데이터는 쿠키 없는 admin client 로 조회(동적 렌더 강제 방지).
  const supabase = createAdminClient();
  const { data: program } = await supabase
    .from("welfare_programs")
    .select("*")
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .not("is_hidden", "is", true) // 회수(숨김) 정책은 404 — admin client 라 RLS(USING is_hidden=false) 대체 명시
    .eq("id", id)
    .single();

  if (!program) notFound();

  // 2026-06-13 정적 ISR 전환 — 아래 3가지는 모두 쿠키(auth.getUser)를 읽어 페이지를
  // 동적으로 만들어 캐시를 깨므로 클라이언트로 이전했다:
  //   · view_count 증가 → ProgramViewTracker → /api/events/track(program_view) 가 증가
  //   · 북마크 초기상태·로그인 여부 → BookmarkButton 자체 self-fetch
  //   · 관리자 자동등록 배지 → AdminAutoConfirmBadge(클라이언트 admin 판정 + candidateId)
  // 관련정책은 비개인화 정적 추천(profile=null). 로그인 사용자 개인화는 추후 클라 보강 가능.
  const dday = calcDday(program.apply_end);
  const period = program.apply_start && program.apply_end
    ? `${program.apply_start} ~ ${program.apply_end}`
    : program.apply_start
    ? `${program.apply_start} ~`
    : program.apply_end
    ? `~ ${program.apply_end}`
    : null;

  const publishedGuide = getPublishedGuide(program as unknown as EvidenceProgram);
  // 정적 ISR — 관련정책은 비개인화(profile signals 없이). 모든 방문자 동일 추천.
  const related = await getRelatedPrograms(
    "welfare",
    program.category,
    program.id,
    program.region,
    4,
    null,
  );

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
  // FAQ 구조화 데이터 — 충실한 핵심정보만 Q&A 로 (AI 검색·네이버 이해 보조, 2026-06-15 CTR).
  const faqs = buildPolicyFaqs(filledSummary);

  // 마감 판정 — apply_end 있고 오늘보다 이전이면 "마감됨"
  const today = new Date().toISOString().split("T")[0];
  const isClosed = !!(program.apply_end && program.apply_end < today);

  return (
    <main className="bg-grey-50 pt-28 pb-8">
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
      {faqs.length > 0 && <FAQSchema questions={faqs} />}

      <div className="mx-auto max-w-content px-5 lg:px-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-grey-700 mb-6">
        <Link href="/welfare" className="font-medium no-underline hover:text-blue-500 transition-colors">복지 지원사업</Link>
        <span className="mx-2 text-grey-600">&gt;</span>
        <span className="text-grey-900 font-medium">{program.title.length > 30 ? program.title.substring(0, 30) + "..." : program.title}</span>
      </nav>

      {/* admin 전용 자동 등록 배지 — 클라이언트에서 admin 판정(정적 ISR 유지).
          일반 사용자·크롤러는 서버 액션 미호출 → 렌더 0 (SEO/UX 영향 0). */}
      {program.auto_confirm_tier && (
        <AdminAutoConfirmBadge
          table="welfare_programs"
          programId={program.id}
          tier={program.auto_confirm_tier as "high" | "mid"}
          isHidden={!!program.is_hidden}
          autoConfirmedAt={program.auto_confirmed_at ?? null}
        />
      )}

      <ProgramViewTracker
        programId={program.id}
        programTable="welfare_programs"
        sourcePage={`/welfare/${program.id}`}
      />

      <ApplyActionDetail
        kind="welfare"
        programId={program.id}
        sourcePage={`/welfare/${program.id}`}
        title={program.title}
        target={program.target}
        region={program.region}
        district={program.district}
        source={program.source}
        sourceUrl={program.source_url}
        updatedAt={program.updated_at}
        eligibility={program.eligibility}
        benefits={program.benefits}
        loanAmount={null}
        interestRate={null}
        applyMethod={program.apply_method}
        applyUrl={program.apply_url}
        applyStart={program.apply_start}
        applyEnd={program.apply_end}
        contactInfo={program.contact_info}
        description={program.description}
        detailedContent={program.detailed_content}
        selectionCriteria={program.selection_criteria}
        requiredDocuments={program.required_documents}
        repaymentPeriod={null}
        dday={dday}
        isClosed={isClosed}
        guide={publishedGuide}
        reviewCheckedAt={publishedGuide?.source.checkedAt ?? null}
        reviewReviewedAt={publishedGuide?.reviewedAt ?? null}
      />

      <div className="mb-8 mt-4 flex flex-wrap gap-3">
        <ShareButton />
        <BookmarkButton programType="welfare" programId={program.id} />
        <Link
          href={`/welfare/${program.id}/draft`}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-blue-50 px-5 text-[15px] font-semibold text-blue-700 no-underline"
        >
          Pro 신청서 초안
        </Link>
      </div>

      <RelatedPrograms programs={related} />
      <p className="mt-8 mb-4 text-[12px] leading-[1.6] text-grey-500">
        정보는 자동 수집·정리된 안내입니다. 최종 신청 조건은 공식 기관 공고에서 다시 확인하세요.
      </p>
      </div>
    </main>
  );
}
