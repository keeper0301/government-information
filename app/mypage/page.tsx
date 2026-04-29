import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserTier } from "@/lib/subscription";
import {
  getUserConsents,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/consent";
import type { IncomeOption, HouseholdOption } from "@/lib/profile-options";
import {
  getOrCreateCode,
  getReferralStats,
  REFERRAL_REWARD_CAP,
} from "@/lib/referrals";
import { ProfileForm } from "./profile-form";
import { ConsentsPanel } from "./consents-panel";
import { AccountTab } from "./account-tab";
import { ReferralTab } from "./referral-tab";
import { MypageTabs } from "./tabs";

export const metadata: Metadata = {
  title: "내 정보 — 정책알리미",
  description: "나의 기본 정보를 관리하고 동의 내역을 확인하세요.",
};

export const dynamic = "force-dynamic";

// 내 정보 페이지 — 서버 컴포넌트
// 1. 로그인 가드 (middleware 와 이중 안전망)
// 2. 프로필 / 동의 / 알림톡 발송 카운트를 병렬 조회
// 3. 결과를 클라이언트 탭 셸(MypageTabs) 에 슬롯 prop 으로 전달
export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/mypage");
  }

  // 이번 달 1일 KST 0시 부터 알림톡 발송 수 카운트.
  // Vercel 서버는 UTC 라 단순 setHours(0) 하면 한국 사용자 기준 9시간 어긋남.
  // KST = UTC+9 → "한국 4월 1일 0시" = "UTC 3월 31일 15시" 로 변환.
  // alert_deliveries.channel='kakao' + status='sent' 만 집계 (실제 도착한 건만).
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1, -9, 0, 0)
  );

  // referral 데이터는 admin client 필수 (INSERT/UPDATE 차단된 RLS).
  // Promise.all 안에서 함께 병렬화 — 페이지 추가 지연 0ms.
  const adminForReferral = createAdminClient();

  const [
    { data: profile },
    consents,
    { count: alertsThisMonth },
    { data: businessProfile },
    referralCode,
    referralStats,
    tier,
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "age_group, region, district, occupation, interests, income_level, household_types, has_children, merit_status"
      )
      .eq("id", user.id)
      .maybeSingle(),
    getUserConsents(user.id),
    supabase
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("channel", "kakao")
      .eq("status", "sent")
      .gte("created_at", monthStart.toISOString()),
    // 자영업자 자격 진단 wedge — business profile 입력 여부만 체크 (id 1 row 페이로드 최소)
    supabase
      .from("business_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Phase 5 A3 — 추천 코드 발급/재사용 (admin client 필수)
    getOrCreateCode(adminForReferral, user.id),
    // 추천 통계 — RLS 본인 SELECT 허용이라 SSR client 도 가능하나, admin 으로 통일
    getReferralStats(adminForReferral, user.id),
    // Phase 6 E1 — 현재 구독 티어 (계정 탭 헤더 배지에 사용)
    getUserTier(user.id),
  ]);

  const email = user.email || "";
  const provider =
    (user.app_metadata as { provider?: string } | null)?.provider ?? null;

  return (
    <main className="max-w-[920px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900">
          내 정보
        </h1>
        <a
          href="/onboarding"
          className="text-xs text-emerald-700 underline hover:text-emerald-900"
        >
          온보딩 다시 하기
        </a>
      </div>

      {/* 이메일은 헤더 보조 영역의 작은 회색 텍스트로 강등 (수정 불가 → 입력 박스 불필요) */}
      <p className="text-[13px] text-grey-600 mb-1">
        📧 {email || "(이메일 미공개)"}
      </p>
      <p className="text-[15px] text-grey-700 mb-8 leading-[1.6]">
        기본 정보를 입력하면 맞춤추천과 알림이 더 정확해져요.
      </p>

      <MypageTabs
        profileSlot={
          <div className="space-y-6">
            {/* 자영업자 자격 진단 wedge 진입 카드 — Basic 핵심 가치.
                business 정보 있으면 "수정", 없으면 "입력하기" 라벨로 분기. */}
            <a
              href="/mypage/business"
              className="block bg-blue-50 border border-blue-200 rounded-2xl p-5 no-underline hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-blue-700 mb-1 tracking-wide">
                    🏪 자영업자/소상공인
                  </p>
                  <p className="text-[15px] font-bold text-blue-900 mb-1">
                    {businessProfile
                      ? "내 가게 정보 수정하기"
                      : "내 가게 정보 입력하기"}
                  </p>
                  <p className="text-[13px] text-blue-800 leading-[1.55]">
                    한 번 입력하면 모든 정책에 자격 ✓/✗ 자동 표시.
                    카톡 알림에도 자격 한 줄이 함께 와요.
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center min-h-[44px] px-4 text-[14px] font-semibold text-white bg-blue-500 rounded-xl">
                  {businessProfile ? "수정 →" : "입력 →"}
                </span>
              </div>
            </a>

            <ProfileForm
              initial={{
                age_group: profile?.age_group ?? null,
                region: profile?.region ?? null,
                district: profile?.district ?? null,
                occupation: profile?.occupation ?? null,
                interests: profile?.interests ?? [],
                income_level: (profile?.income_level ?? null) as
                  | IncomeOption
                  | null,
                household_types: (profile?.household_types ?? []) as HouseholdOption[],
                has_children: (profile?.has_children ?? null) as boolean | null,
                merit_status: (profile?.merit_status ?? null) as "merit" | "none" | null,
              }}
            />
          </div>
        }
        consentsSlot={
          <section id="consents" className="scroll-mt-20">
            <p className="text-[14px] text-grey-700 mb-6 leading-[1.6]">
              이용약관·개인정보·마케팅 동의 내역을 확인하고 선택 동의를 관리할 수 있어요.
            </p>
            <ConsentsPanel
              initialConsents={consents}
              currentVersions={{
                privacy_policy: PRIVACY_POLICY_VERSION,
                terms: TERMS_VERSION,
              }}
            />
          </section>
        }
        referralSlot={
          <ReferralTab
            code={referralCode}
            shareUrl={`https://www.keepioo.com/?ref=${referralCode}`}
            stats={referralStats}
            capLimit={REFERRAL_REWARD_CAP}
          />
        }
        accountSlot={
          <AccountTab
            email={email}
            createdAt={user.created_at ?? null}
            provider={provider}
            alertsThisMonth={alertsThisMonth ?? 0}
            tier={tier}
          />
        }
      />
    </main>
  );
}
