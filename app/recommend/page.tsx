import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RecommendForm } from "./form";

export const metadata: Metadata = {
  title: "맞춤추천 — 정책알리미",
  description: "나이, 지역, 직업에 맞는 복지·대출 정책을 추천받으세요.",
};

// 맞춤추천 페이지 (서버 컴포넌트)
// - 로그인한 사용자는 /mypage 에 저장한 프로필을 폼에 자동으로 채워줌
// - 비로그인 사용자는 빈 폼으로 시작 (기존 UX 유지)
export default async function RecommendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 상태면 본인 프로필 조회 (RLS 적용)
  let initial: {
    age_group: string | null;
    region: string | null;
    occupation: string | null;
  } | null = null;

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
    }
  }

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 페이지 제목 */}
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        맞춤추천
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        나의 조건에 맞는 정책을 찾아드립니다
      </p>

      {/* 추천 폼 + 결과 (클라이언트 컴포넌트) */}
      <RecommendForm initial={initial} />
    </main>
  );
}
