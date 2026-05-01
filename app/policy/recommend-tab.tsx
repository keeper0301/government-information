// ============================================================
// RecommendTab — /policy 의 "맞춤추천" 탭 (디폴트)
// ============================================================
// 비로그인        → 가입/로그인 유도 + "맞춤추천 받기" CTA
// 로그인+프로필 X → 프로필 입력 안내 + 동일 CTA
// 로그인+프로필 ✓ → 추천 결과 5건 미리보기 + "전체 결과 보기 →" CTA
// ============================================================

import Link from "next/link";
import { getRecommendations } from "@/lib/recommend";
import { AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS } from "@/lib/profile-options";
import { ProgramRow } from "@/components/program-row";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { buildRecommendationParamsFromSignals } from "@/lib/recommendation-params";

// 비로그인 또는 프로필 미완성 상태에서 보여줄 카드 (CTA 동일)
function CallToActionCard({ title, message }: { title: string; message: string }) {
  return (
    <section className="bg-blue-50 border border-blue-200 rounded-2xl p-10 text-center max-md:p-6">
      <h2 className="text-[20px] font-bold text-grey-900 mb-3">{title}</h2>
      <p className="text-[14px] text-grey-600 mb-6 leading-relaxed">{message}</p>
      <Link
        href="/recommend"
        className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 no-underline transition-colors min-h-[44px]"
      >
        맞춤추천 받기
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}

export async function RecommendTab() {
  const fullProfile = await loadUserProfile();

  // 1. 비로그인
  if (!fullProfile) {
    return (
      <CallToActionCard
        title="나에게 맞는 정책을 찾아드려요"
        message="나이·지역·직업 3가지만 알려주시면 5,000+ 정책 중 딱 맞는 것을 골라드립니다. 로그인하면 다음에 다시 입력하지 않아도 돼요."
      />
    );
  }

  const age = fullProfile.signals.ageGroup;
  const region = fullProfile.signals.region;
  const district = fullProfile.signals.district;
  const occupation = fullProfile.signals.occupation;

  // 3필드 모두 옵션 목록의 유효한 값일 때만 추천 실행 (recommend/page.tsx 와 동일 검증)
  const isValidAge = age ? (AGE_OPTIONS as readonly string[]).includes(age) : false;
  const isValidRegion = region
    ? (REGION_OPTIONS as readonly string[]).includes(region)
    : false;
  const isValidOcc = occupation
    ? (OCCUPATION_OPTIONS as readonly string[]).includes(occupation)
    : false;

  // 3. 프로필 미완성
  if (!isValidAge || !isValidRegion || !isValidOcc) {
    return (
      <CallToActionCard
        title="프로필을 완성하면 맞춤추천이 시작돼요"
        message="나이·지역·직업 3가지만 입력하면 됩니다. 한 번 입력하면 다음부터는 자동으로 추천돼요."
      />
    );
  }

  // 4. 프로필 완성 → 추천 결과 5개 미리보기
  const recommendParams = buildRecommendationParamsFromSignals(
    fullProfile.signals,
    { programType: "all" },
  );
  if (!recommendParams) {
    return (
      <CallToActionCard
        title="프로필을 완성하면 맞춤추천이 시작돼요"
        message="나이·지역·직업 3가지만 입력하면 됩니다. 한 번 입력하면 다음부터는 자동으로 추천돼요."
      />
    );
  }

  const all = await getRecommendations(recommendParams);
  const programs = all.slice(0, 5);
  const businessProfile = fullProfile?.signals.businessProfile ?? null;

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[18px] font-bold text-grey-900">
          나에게 추천하는 정책
        </h2>
        <span className="text-[13px] text-grey-600">
          전체 {all.length.toLocaleString()}건 매칭
        </span>
      </div>
      <p className="text-[14px] text-grey-600 mb-6">
        {age} · {region}
        {district ? ` ${district}` : ""} · {occupation} 기준
      </p>

      {programs.length > 0 ? (
        <div className="bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2 mb-6">
          {programs.map((p) => (
            <ProgramRow key={p.id} program={p} businessProfile={businessProfile} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-grey-600 bg-white border border-grey-200 rounded-2xl mb-6">
          현재 조건에 맞는 정책이 없어요. 조건을 조금 바꿔보세요.
        </div>
      )}

      <div className="text-center">
        <Link
          href="/recommend"
          className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold text-white bg-grey-900 rounded-lg hover:bg-grey-800 no-underline transition-colors min-h-[44px]"
        >
          전체 추천 결과 보기 ({all.length.toLocaleString()}건)
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
