// ============================================================
// /onboarding/topics — 가입 직후 관심 분야 권유 화면
// ============================================================
// 흐름:
//   1) 신규 가입자가 이메일 인증/소셜 로그인 후 callback 에서 진입
//   2) 관심 토픽 선택 (다중, 0~8개) 또는 스킵
//   3) 저장하면 user_profiles.interests 에 반영, 홈으로 이동
//
// CEO 리뷰 결정:
//   - Q2: 권유 (스킵 가능). 미선택 시 전체 알림으로 fallback.
//   - 한도 8개 (Section 4 엣지 케이스 방어)
//
// 보안:
//   - 미로그인 → /login 리다이렉트
//   - RLS 가 본인 행만 upsert 허용 (이미 user_profiles 에 정책 있음)
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TopicPicker } from "./topic-picker";

export const metadata: Metadata = {
  title: "관심 분야 선택 | 정책알리미",
  description: "관심 있는 정책 분야를 알려주세요. 맞춤 알림이 더 정확해져요.",
};

// 토픽 목록 — 마이페이지의 INTERESTS 와 동일 (단일 소스 추후 통합 검토)
const TOPICS = [
  "복지", "대출", "청년", "출산·육아", "창업", "주거", "교육", "의료", "고용",
] as const;

const MAX_TOPICS = 8;

export default async function OnboardingTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인 → 로그인으로
  if (!user) {
    redirect("/login?next=/onboarding/topics");
  }

  // 이미 토픽을 골라둔 사용자가 우연히 들어왔으면 마이페이지로 보냄
  // (다시 고르고 싶으면 마이페이지 프로필 폼에서)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("interests")
    .eq("id", user.id)
    .maybeSingle();

  const initialInterests = profile?.interests ?? [];

  // 이미 선택돼 있으면 굳이 온보딩 다시 보일 필요 없음
  if (initialInterests.length > 0) {
    const params = await searchParams;
    redirect(params.next ?? "/mypage");
  }

  const params = await searchParams;
  const nextHref = params.next ?? "/";

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[640px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-10 md:mb-14">
          <p className="text-[12px] text-burgundy font-semibold tracking-[0.2em] mb-3">
            STEP 1 / 1
          </p>
          <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.6px] text-grey-900 mb-3 leading-[1.25]">
            관심 분야를 알려주세요
          </h1>
          <p className="text-[15px] text-grey-700 leading-[1.6]">
            선택하신 분야에 새 정책이 나오면 우선 알려드릴게요.
            <br />
            지금 건너뛰셔도 마이페이지에서 언제든 설정할 수 있어요.
          </p>
        </div>

        {/* 토픽 선택 (클라이언트 컴포넌트) */}
        <TopicPicker
          userId={user.id}
          topics={TOPICS as unknown as string[]}
          maxSelectable={MAX_TOPICS}
          initialSelected={initialInterests}
          nextHref={nextHref}
        />
      </div>
    </main>
  );
}
