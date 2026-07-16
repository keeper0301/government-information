import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlertList } from "./alert-list";
import { PushToggle } from "@/components/push-toggle";

export const metadata: Metadata = {
  title: "알림센터 — 정책알리미",
  description: "내가 등록한 마감 알림을 확인하고 관리하세요.",
  robots: { index: false, follow: true },
};

// 알림센터 페이지 — 로그인 필수
// middleware 에서 미로그인 접근을 미리 차단하지만, 세션 만료 등
// 드문 경우를 대비해 페이지에서도 한 번 더 확인 후 로그인으로 돌려보냄
export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/alerts");
  }

  return (
    <main className="max-w-content mx-auto px-5 lg:px-10 pt-[80px] pb-20">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        알림센터
      </h1>
      <p className="text-[15px] text-grey-600 mb-6">
        등록한 마감 알림을 확인하고 관리하세요
      </p>

      {/* 2026-05-31 P3 #8 — 알림센터에 PushToggle prominent 노출.
          마이페이지 계정 탭의 깊은 위치 외에 알림 사용자가 가장 자주 보는
          페이지에서도 즉시 구독 가능. PushToggle 자체가 subscribed 상태면
          작은 indicator 만 보이므로 이미 구독한 사용자에게는 noise 0. */}
      <div className="mb-8">
        <PushToggle />
      </div>

      <AlertList />
    </main>
  );
}
