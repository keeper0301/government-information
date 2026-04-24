import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getUserConsents,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/consent";
import { ProfileForm } from "./profile-form";
import { ConsentsPanel } from "./consents-panel";
import { WithdrawSection } from "./withdraw-section";

export const metadata: Metadata = {
  title: "내 정보 — 정책알리미",
  description: "나의 기본 정보를 관리하고 동의 내역을 확인하세요.",
};

export const dynamic = "force-dynamic";

// 내 정보 페이지 (서버 컴포넌트)
// - 로그인 안 되어 있으면 /login?next=/mypage 로 보냄
// - 로그인 되어 있으면 user_profiles 에서 본인 프로필을 불러와 폼에 전달
// (추가로 middleware 도 같은 경로를 보호하지만, 페이지에서도 한 번 더 확인해서
//  예상치 못한 세션 만료 상황에서도 안전하게 처리)
export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/mypage");
  }

  // 본인 프로필 + 동의 현황 병렬 조회 (둘 다 페이지 렌더링에 필요)
  const [{ data: profile }, consents] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("age_group, region, district, occupation, interests")
      .eq("id", user.id)
      .maybeSingle(),
    getUserConsents(user.id),
  ]);

  return (
    <main className="max-w-[640px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        내 정보
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        기본 정보를 입력하면 맞춤추천과 알림이 더 정확해져요.
      </p>

      {/* 이메일은 수정 불가 (로그인 제공사에서 받아온 값) */}
      <div className="mb-6">
        <label className="block text-[13px] font-semibold text-grey-700 mb-2">
          이메일
        </label>
        <div className="px-4 py-3 bg-grey-50 border border-grey-200 rounded-lg text-[15px] text-grey-700">
          {user.email || (
            <span className="text-grey-600">(이메일 미공개)</span>
          )}
        </div>
      </div>

      {/* 프로필 편집 (나이·지역·직업·관심사) */}
      <ProfileForm
        initial={{
          age_group: profile?.age_group ?? null,
          region: profile?.region ?? null,
          district: profile?.district ?? null,
          occupation: profile?.occupation ?? null,
          interests: profile?.interests ?? [],
        }}
      />

      {/* 동의 관리 섹션 — 필수/선택 동의 현황과 토글 */}
      <section id="consents" className="mt-12 pt-8 border-t border-grey-100 scroll-mt-20">
        <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900 mb-2">
          동의 관리
        </h2>
        <p className="text-[14px] text-grey-600 mb-6 leading-[1.6]">
          이용약관·개인정보·마케팅 동의 내역을 확인하고 선택 동의를 관리할 수 있어요.
        </p>

        <ConsentsPanel
          initialConsents={consents}
          currentVersions={{
            privacy_policy: PRIVACY_POLICY_VERSION,
            terms: TERMS_VERSION,
          }}
        />

        <p className="mt-6 text-[13px] text-grey-600 leading-[1.6]">
          필수 동의(이용약관·개인정보처리방침)는 서비스 이용을 위해 철회할 수 없습니다.
          <br />
          철회를 원하시면 아래 <b>회원 탈퇴</b> 섹션에서 탈퇴를 진행해 주세요.
        </p>
      </section>

      {/* 회원 탈퇴 섹션 — 최하단 배치 (의도치 않은 접근 방지) */}
      <WithdrawSection />
    </main>
  );
}
