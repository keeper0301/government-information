import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getUserConsents,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/consent";
import type { IncomeOption, HouseholdOption } from "@/lib/profile-options";
import { ProfileForm } from "./profile-form";
import { ConsentsPanel } from "./consents-panel";
import { AccountTab } from "./account-tab";
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

  const [{ data: profile }, consents, { count: alertsThisMonth }] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select(
          "age_group, region, district, occupation, interests, income_level, household_types"
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
            }}
          />
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
        accountSlot={
          <AccountTab
            email={email}
            createdAt={user.created_at ?? null}
            provider={provider}
            alertsThisMonth={alertsThisMonth ?? 0}
          />
        }
      />
    </main>
  );
}
