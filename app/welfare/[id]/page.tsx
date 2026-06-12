import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { AlarmButton } from "@/components/alarm-button";
import { ShareButton } from "@/components/share-button";
import { BookmarkButton } from "@/components/bookmark-button";
import { isBookmarked } from "@/lib/bookmarks";
import { InfoSection } from "@/components/info-section";
import { RelatedPrograms } from "@/components/related-programs";
import { GovernmentServiceSchema, BreadcrumbSchema } from "@/components/json-ld";
import { ProgramViewTracker } from "@/components/analytics/program-view-tracker";
import { ApplyClickTracker } from "@/components/analytics/apply-click-tracker";
import { SummaryItem } from "@/components/summary-item";
import { SparseDataNotice } from "@/components/sparse-data-notice";
import { calcDday, getRelatedPrograms } from "@/lib/programs";
import { cleanDescription, isSubstantiallyDuplicate, stripCardDuplicates } from "@/lib/utils";
import { isDeepLink, sanitizeApplyUrl } from "@/lib/utils/apply-url";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";
import { cleanPolicyTitle } from "@/lib/policy-title";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { isAdminUser } from "@/lib/admin-auth";
import { findCandidateByProgramId } from "@/lib/press-ingest/candidates";
import { AutoConfirmBadge } from "@/components/admin/auto-confirm-badge";
import { PolicyGuideBox } from "@/components/policy/PolicyGuideBox";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  // AdSense "thin content" 거절 대응 — sparse 페이지는 검수자 sample 에서 빠지도록
  // robots noindex. 본문 + 핵심 정보 카드 채움 정도로 판정 (page render 와 같은 기준).
  // 2026-05-11: unique_insight (keepioo 자체 해설) 있는 페이지는 본문 풍부 (200~400자 추가)
  // → sparse 판정에서 면제. 백필 cron 진행과 함께 자연스럽게 index 페이지 확대.
  const { data } = await supabase
    .from("welfare_programs")
    .select("title, description, eligibility, benefits, apply_method, apply_start, apply_end, unique_insight")
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .eq("id", id)
    .single();
  if (!data) return { title: "복지 지원사업 — 정책알리미" };

  const descLen = (data.description || "").length;
  const period = data.apply_start && data.apply_end ? "x" : data.apply_start || data.apply_end || null;
  const summaryFields = [data.eligibility, data.benefits, period, data.apply_method];
  const filledCount = summaryFields.filter((v) => v && !isSubstantiallyDuplicate(v as string, data.description)).length;
  const hasInsight = !!(data.unique_insight && (data.unique_insight as string).trim().length >= 80);
  // "thin" 임계 — 2026-05-18 AdSense 재거절 후 엄격 강화.
  // unique_insight 없으면 무조건 noindex (정부 원문 복붙 페이지 검수자 노출 차단).
  // filledCount/descLen 충실 보조 조건은 폐기 — AdSense "low value content" 정책상
  // 정부 데이터 가공만으로는 부가가치 불충분 판정. 백필 완료 row 만 index.
  const isSparse = !hasInsight;
  // 회귀 감시: filledCount/descLen 도 함께 기록 (admin/insight-progress 진단용).
  void filledCount; void descLen;

  // 2026-06-11 — title 정제(기관명 제거·지역 앞으로, CTR 개선) 후 검색의도 키워드 보강.
  // 짧은 정책명(24자 이하)에만 붙여 잘림(네이버 ~40자) 방지. 롱테일("OO 신청방법·자격") 매칭.
  const baseTitle = cleanPolicyTitle(data.title);
  const seoTitle =
    baseTitle.length <= 24
      ? `${baseTitle} 신청자격·방법 — 정책알리미`
      : `${baseTitle} — 정책알리미`;
  // 2026-06-11 — 검색결과 스니펫(description)을 unique_insight(keepioo 자체 해설) 우선으로.
  // 정부 원문 그대로면 여러 페이지 "동일 설명문 중복"(네이버 진단) + 딱딱해 CTR 낮음 → 해설로
  // 고유화·매력화. 없으면(noindex sparse) 정부 description fallback. 160자 cut(스니펫 권장).
  const metaDescription = hasInsight
    ? (data.unique_insight as string).trim().replace(/\s+/g, " ").slice(0, 160)
    : data.description || undefined;
  return {
    title: seoTitle,
    description: metaDescription,
    // 자기참조 canonical — 미지정 시 layout 의 canonical:"/" 를 상속해
    // 모든 상세가 "루트의 중복" 으로 색인 거부됨 (2026-06-05 SC 미색인 진단).
    alternates: { canonical: `/welfare/${id}` },
    ...(isSparse && { robots: { index: false, follow: false } }),
  };
}

export default async function WelfareDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("welfare_programs")
    .select("*")
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .eq("id", id)
    .single();

  if (!program) notFound();

  // 조회수 증가 (fire-and-forget). service_role 로 호출 — anon 직접 RPC 조작(조회수 부풀림→추천 왜곡) 차단.
  createAdminClient().rpc("increment_view_count", { p_table_name: "welfare_programs", p_row_id: id })
    .then(({ error }) => { if (error) console.error("view count error:", error); });

  // 로그인 여부 + 북마크 상태 — BookmarkButton 초기 상태 hydration 용
  const { data: { user } } = await supabase.auth.getUser();
  const initialBookmarked = user ? await isBookmarked("welfare", id) : false;
  const profile = user ? await loadUserProfile() : null;

  // admin 분기 — 자동 등록 정책의 경우 회수/복원 배지 노출 (일반 사용자엔 X).
  // DDL 077 미적용 환경에서는 program.auto_confirm_tier 가 undefined 라 자연 분기됨.
  const isAdmin = !!user && isAdminUser(user.email);
  const candidateInfo =
    isAdmin && program.auto_confirm_tier
      ? await findCandidateByProgramId({ table: "welfare_programs", programId: id })
      : null;

  const dday = calcDday(program.apply_end);
  const period = program.apply_start && program.apply_end
    ? `${program.apply_start} ~ ${program.apply_end}`
    : program.apply_start
    ? `${program.apply_start} ~`
    : program.apply_end
    ? `~ ${program.apply_end}`
    : null;

  const sourceLink = program.source_url || program.apply_url;
  // 외부 apply_url 스킴 검증 — javascript:/data: 등 위험 스킴·깨진 URL 이면 null
  // → 신청 버튼 대신 Google 검색 fallback (XSS·피싱·깨진 링크 방지)
  const safeApplyUrl = sanitizeApplyUrl(program.apply_url);
  const related = await getRelatedPrograms(
    "welfare",
    program.category,
    program.id,
    program.region,
    4,
    profile?.signals ?? null,
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
    <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
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

      {/* admin 전용 자동 등록 배지 — 일반 사용자 렌더 0 (SEO/UX 영향 0) */}
      {isAdmin && program.auto_confirm_tier && (
        <div className="mb-4">
          <AutoConfirmBadge
            candidateId={candidateInfo?.candidateId ?? null}
            tier={program.auto_confirm_tier as "high" | "mid"}
            isHidden={!!program.is_hidden}
            autoConfirmedAt={program.auto_confirmed_at ?? null}
          />
        </div>
      )}

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

      {/* Phase A 클릭 분석 — 페이지 진입 시 program_view event 자동 기록 */}
      <ProgramViewTracker
        programId={program.id}
        programTable="welfare_programs"
        sourcePage={`/welfare/${program.id}`}
      />

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

      {/* 출처 + 큐레이션 고지 — 핵심 정보 바로 아래 (loan 과 동일).
          AdSense "재게시 사이트" 의심 차단 — 출처 명시 + 정리·해설 큐레이션 시그널. */}
      <div className="bg-white border border-grey-200 rounded-xl px-6 py-4 mb-6">
        <div className="text-[14px] font-semibold text-grey-900 mb-0.5">
          원문 출처: {program.source} <span className="text-[12px] font-normal text-grey-700">(정부 공식)</span>
        </div>
        <div className="text-[13px] text-grey-700 leading-[1.6]">
          최종 확인일: {new Date(program.updated_at).toLocaleDateString("ko-KR")}
          {" · "}정부 공식 자료를 바탕으로 keepioo 가 정리·구조화한 안내입니다.
          공식 신청·확인은 출처 사이트에서 진행해 주세요.
        </div>
      </div>

      {/* keepioo 자체 해설 — 정부 원문 위에 배치 (큐레이션 시그널 강화).
          AdSense 검수자가 위→아래 스캔 시 "재게시 X, 큐레이션 O" 인식.
          DDL 083 미적용 / 백필 미완료 row 는 unique_insight=NULL → 자연 생략. */}
      {program.unique_insight && (
        <section className="bg-blue-50/40 border border-blue-200 rounded-2xl p-8 mb-6 max-md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[17px] font-bold text-grey-900 tracking-[-0.3px]">
              이 정책을 한눈에
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              keepioo 정리
            </span>
          </div>
          <div className="text-[15px] text-grey-800 leading-[1.8] whitespace-pre-line">
            {program.unique_insight}
          </div>
        </section>
      )}

      {/* keepioo 자체 가치 박스 — AI 생성 팁/거절 사유/체크리스트.
          백필 전 row 는 3 필드 NULL → template fallback. */}
      <PolicyGuideBox
        tips={(program as { ai_tips?: string | null }).ai_tips ?? null}
        faq={(program as { ai_faq?: string | null }).ai_faq ?? null}
        checklist={(program as { ai_checklist?: string | null }).ai_checklist ?? null}
        category={program.category}
      />

      {/* Description — InfoSection 통일 디자인. 카드 중복 라인 제거. 결과 비면 생략. */}
      {(() => {
        const cleaned = stripCardDuplicates(cleanDescription(program.description));
        if (!cleaned) return null;
        return (
          <InfoSection title="공고 내용 (정부 원문)">
            <p className="text-[16px] font-medium text-grey-800 leading-[1.8] max-md:text-[15px] whitespace-pre-wrap">
              {cleaned}
            </p>
          </InfoSection>
        );
      })()}

      {/* 상세 내용 — description 과 substantially 같으면 숨김 (사장님 캡쳐 사고). */}
      {program.detailed_content &&
        !isSubstantiallyDuplicate(program.detailed_content, program.description) && (
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

      {/* Action buttons — 콘텐츠 전체를 본 뒤 최종 CTA. 3단 분기 유지.
          Phase A apply_click event 자동 기록 (ApplyClickTracker wrapper). */}
      <div className="flex gap-3 flex-wrap mb-10 mt-6">
        {safeApplyUrl && isDeepLink(safeApplyUrl) ? (
          <ApplyClickTracker
            programId={program.id}
            programTable="welfare_programs"
            sourcePage={`/welfare/${program.id}`}
            href={safeApplyUrl}
            className="px-6 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-600 transition-colors"
          >
            신청하기
          </ApplyClickTracker>
        ) : safeApplyUrl ? (
          <ApplyClickTracker
            programId={program.id}
            programTable="welfare_programs"
            sourcePage={`/welfare/${program.id}`}
            href={safeApplyUrl}
            className="px-6 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl no-underline hover:bg-grey-200 transition-colors"
          >
            {program.source} 홈페이지 방문
          </ApplyClickTracker>
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
        {/* Pro 신청서 초안 — 모든 사용자에게 노출, 비Pro 는 server 가드가 /pricing redirect.
            ISR 유지 위해 tier 분기는 client/redirect 로 처리. */}
        <Link
          href={`/welfare/${program.id}/draft`}
          className="px-6 py-3 bg-blue-50 text-blue-700 text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-100 transition-colors inline-flex items-center gap-1.5"
        >
          📄 Pro 신청서 초안
        </Link>
      </div>

      {/* Related Programs */}
      <RelatedPrograms programs={related} />
    </main>
  );
}
