// ============================================================
// /mypage/notifications/history — 알림 수신 이력
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "알림 수신 이력 — keepioo",
};

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/notifications/history");

  const { data: deliveries } = await supabase
    .from("alert_deliveries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-4">
        <Link href="/mypage/notifications" className="text-sm text-blue-600 underline">
          ← 맞춤 알림 설정
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">알림 수신 이력</h1>

      {!deliveries || deliveries.length === 0 ? (
        <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500">
          아직 발송된 알림이 없어요. 매일 오후 4시에 새 정책을 확인해서 발송됩니다.
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => {
            const statusLabel = d.status === "sent" ? "발송완료"
              : d.status === "failed" ? "실패"
              : d.status === "queued" ? "대기중"
              : "제외";
            const statusColor = d.status === "sent" ? "text-green-600"
              : d.status === "failed" ? "text-red-600"
              : "text-gray-500";
            const channelLabel = d.channel === "email" ? "이메일" : "알림톡";
            const typePath = d.program_table === "welfare_programs" ? "welfare" : "loan";
            return (
              <Link
                key={d.id}
                href={`/${typePath}/${d.program_id}`}
                className="block border border-gray-200 rounded-xl p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{d.program_title || "(제목 없음)"}</div>
                  <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {channelLabel} · {new Date(d.created_at).toLocaleString("ko-KR")}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
