import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getRecommendations } from "@/lib/recommend";
import { AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS } from "@/lib/profile-options";
import type {
  AgeOption,
  RegionOption,
  OccupationOption,
} from "@/lib/profile-options";
import type { DisplayProgram } from "@/lib/programs";
import { RecommendForm } from "./form";

export const metadata: Metadata = {
  title: "맞춤추천 — 정책알리미",
  description: "나이, 지역, 직업에 맞는 복지·대출 정책을 추천받으세요.",
};

// 맞춤추천 페이지 (서버 컴포넌트)
// - 로그인 + 프로필 3필드(나이·지역·직업) 완비 시 서버에서 즉시 추천 결과 계산
//   → 페이지 로드 직후 결과 노출 (JS 없이도 첫 화면 완성)
// - 프로필 없음 / 비로그인은 기존과 동일하게 빈 폼으로 시작
export default async function RecommendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initial: {
    age_group: string | null;
    region: string | null;
    occupation: string | null;
  } | null = null;

  let initialPrograms: DisplayProgram[] | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("age_group, region, occupation")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      initial = {
        age_group: profile.age_group ?? null,
        region: profile.region ?? null,
        occupation: profile.occupation ?? null,
      };

      // 3필드 모두 채워져 있고 옵션 목록에 있는 유효한 값일 때만 초기 추천 실행
      // 불일치하는 과거 데이터는 폼 기본값으로만 사용하고 API 호출은 스킵
      const isValidAge = profile.age_group
        ? AGE_OPTIONS.includes(profile.age_group as AgeOption)
        : false;
      const isValidRegion = profile.region
        ? REGION_OPTIONS.includes(profile.region as RegionOption)
        : false;
      const isValidOcc = profile.occupation
        ? OCCUPATION_OPTIONS.includes(profile.occupation as OccupationOption)
        : false;

      if (isValidAge && isValidRegion && isValidOcc) {
        initialPrograms = await getRecommendations({
          ageGroup: profile.age_group as AgeOption,
          region: profile.region as RegionOption,
          occupation: profile.occupation as OccupationOption,
        });
      }
    }
  }

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        맞춤추천
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        나의 조건에 맞는 정책을 찾아드립니다
      </p>

      <RecommendForm initial={initial} initialPrograms={initialPrograms} />
    </main>
  );
}
