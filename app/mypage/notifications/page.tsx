// ============================================================
// /mypage/notifications — 맞춤 알림 규칙 관리 페이지
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserTier, TIER_NAMES } from "@/lib/subscription";
import { hasActiveConsent } from "@/lib/consent";
import { RuleForm } from "./rule-form";

export const metadata: Metadata = {
  title: "맞춤 알림 설정 — keepioo",
  description: "관심 지역·연령·업종 조건을 등록하고 새 정책을 이메일·알림톡으로 받아보세요.",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/notifications");

  const tier = await getUserTier(user.id);

  // 무료 사용자 → pricing 으로 안내
  if (tier === "free") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-2xl font-bold mb-4">맞춤 정책 알림</h1>
        <div className="rounded-2xl bg-blue-50 p-6 border border-blue-100">
          <p className="text-lg font-bold mb-2">베이직 플랜부터 이용 가능해요</p>
          <p className="text-gray-600 mb-4">
            내 조건에 맞는 새 정부·지자체 정책을 매일 이메일로 받아볼 수 있어요.
            카카오 알림톡은 프로 플랜에서 추가로 이용 가능해요.
          </p>
          <Link
            href="/pricing"
            className="inline-block rounded-xl bg-blue-600 px-5 py-3 text-white font-semibold"
          >
            요금제 보기
          </Link>
        </div>
      </main>
    );
  }

  // 내 규칙 목록
  const { data: rules } = await supabase
    .from("user_alert_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // 카카오 알림톡 수신 동의 상태 — 폼 UI 에서 채널 선택 전 안내하기 위해 서버에서 미리 조회.
  const kakaoConsented = await hasActiveConsent(user.id, "kakao_messaging");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold">맞춤 정책 알림</h1>
        <Link href="/mypage/notifications/history" className="text-sm text-blue-600 underline">
          수신 이력 →
        </Link>
      </div>
      <p className="text-gray-600 mb-6 text-sm">
        현재 플랜: <span className="font-semibold">{TIER_NAMES[tier]}</span>
        {tier === "basic" && (
          <>
            · 카카오 알림톡을 받고 싶으면{" "}
            <Link href="/pricing" className="text-blue-600 underline">프로로 업그레이드</Link>
          </>
        )}
      </p>

      <RuleForm
        tier={tier}
        existingRules={rules || []}
        kakaoConsented={kakaoConsented}
      />
    </main>
  );
}
