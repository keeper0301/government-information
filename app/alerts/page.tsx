import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AlertList } from "./alert-list";

export const metadata: Metadata = {
  title: "알림센터 — 정책알리미",
  description: "내가 등록한 마감 알림을 확인하고 관리하세요.",
};

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 미로그인 상태
  if (!user) {
    return (
      <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
          알림센터
        </h1>
        <div className="text-center py-20">
          <div className="text-[48px] mb-4">🔔</div>
          <p className="text-[17px] text-grey-700 font-semibold mb-2">
            로그인이 필요합니다
          </p>
          <p className="text-[14px] text-grey-500 mb-6">
            마감 알림을 등록하고 관리하려면 로그인해주세요.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl no-underline hover:bg-blue-600 transition-colors"
          >
            로그인하기
          </a>
        </div>
      </main>
    );
  }

  // 로그인 상태: 클라이언트 컴포넌트에 위임
  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        알림센터
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        등록한 마감 알림을 확인하고 관리하세요
      </p>
      <AlertList />
    </main>
  );
}
