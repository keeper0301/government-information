// ============================================================
// /mypage/consents — 동의 이력 조회 및 선택 동의 관리
// ============================================================
// - 5종 동의 (privacy_policy / terms / marketing / sensitive_topic / kakao_messaging)
//   각각의 현재 active 여부 + 마지막 동의 시점을 표시
// - 선택 동의 (marketing / sensitive_topic / kakao_messaging) 는 토글로 철회·재동의 가능
// - 필수 동의 (privacy_policy / terms) 는 "철회 불가 · 탈퇴 시 자동 철회" 안내만 표시
// ============================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserConsents } from "@/lib/consent";
import { ConsentsPanel } from "./consents-panel";

export const metadata: Metadata = {
  title: "동의 관리 — 정책알리미",
  description: "이용약관·개인정보·마케팅 등 동의 내역을 확인하고 선택 동의를 관리하세요.",
};

export const dynamic = "force-dynamic";

export default async function ConsentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/mypage/consents");
  }

  // 현재 동의 상태 (5종 중 기록된 것만 반환)
  const consents = await getUserConsents(user.id);

  return (
    <main className="max-w-[640px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        동의 관리
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        이용약관·개인정보·마케팅 동의 내역을 확인하고 선택 동의를 관리할 수 있어요.
      </p>

      <ConsentsPanel initialConsents={consents} />

      <div className="mt-10 pt-6 border-t border-grey-100 text-[13px] text-grey-500 leading-[1.6]">
        필수 동의(이용약관·개인정보처리방침)는 서비스 이용을 위해 철회할 수 없습니다.
        <br />
        철회를 원하시면 회원 탈퇴를 진행해주세요. 탈퇴 시 모든 동의가 자동 철회됩니다.
      </div>
    </main>
  );
}
