import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "내 정보 — 정책알리미",
  description: "나의 기본 정보를 관리하고 맞춤 알림을 정확하게 받으세요.",
};

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

  // 본인 프로필 조회 (RLS가 본인 것만 허용)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("age_group, region, occupation, interests")
    .eq("id", user.id)
    .maybeSingle();

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
            <span className="text-grey-500">(이메일 미공개)</span>
          )}
        </div>
      </div>

      {/* 실제 편집 가능한 폼 (클라이언트 컴포넌트) */}
      <ProfileForm
        initial={{
          age_group: profile?.age_group ?? null,
          region: profile?.region ?? null,
          occupation: profile?.occupation ?? null,
          interests: profile?.interests ?? [],
        }}
      />
    </main>
  );
}
