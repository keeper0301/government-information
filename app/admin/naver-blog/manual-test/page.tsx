// ============================================================
// /admin/naver-blog/manual-test — Phase 2-C 사장님 검증 페이지
// ============================================================
// ⚠️ DEPRECATED (2026-05-13) — Vercel chromium IP 차단으로 작동 X.
// 사장님 PC 의 scripts/naver-publish-runner.mjs --dry-run 으로 대체.
// 코드 유지는 향후 OpenAPI 전환 시 UI 참고용.
//
// 원래 흐름: cookies upload 후 cron 활성화 전 1건 manual 검증.
// dry-run = 발행 직전까지만 (selector·iframe·cookies 검증) → 안전.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getActiveCookies } from "@/lib/naver-blog/cookies-vault";
import { listPendingNaverQueue } from "@/lib/naver-blog/queue";
import { ManualTestForm } from "./manual-test-form";

export const metadata: Metadata = {
  title: "네이버 RPA 검증 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ManualTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) redirect("/");

  let cookies = null;
  let cookiesError: string | null = null;
  try {
    cookies = await getActiveCookies();
  } catch (err) {
    cookiesError = err instanceof Error ? err.message : String(err);
  }

  const pending = await listPendingNaverQueue(20).catch(() => []);
  const options = pending.map((row) => ({
    id: row.id,
    title: row.payload.title,
  }));

  return (
    <div className="space-y-6 max-w-[820px]">
      <AdminPageHeader
        kicker="ADMIN · 네이버 RPA"
        title="Phase 2-C 매뉴얼 검증"
        description="cron 활성화 전 1건 dry-run + 실제 발행 검증. 캡차·2FA 감지·selector 일치성 확인."
      />

      {/* 사전 조건 카드 */}
      <div className="rounded-lg border border-grey-200 bg-white p-4 space-y-2 text-sm">
        <h2 className="font-bold text-base mb-2">사전 조건</h2>
        <p>
          <span className={cookies ? "text-green-700" : "text-red-700"}>
            {cookies ? "✅" : "❌"}
          </span>{" "}
          cookies vault:{" "}
          {cookiesError ? (
            <span className="text-red-700">{cookiesError}</span>
          ) : cookies ? (
            <span>
              <strong>{cookies.cookies.length}개</strong> active (
              {new Date(cookies.uploadedAt).toLocaleString("ko-KR")} 업로드)
            </span>
          ) : (
            <span>
              <a
                href="/admin/naver-blog/cookies"
                className="text-blue-600 underline"
              >
                /admin/naver-blog/cookies
              </a>{" "}
              에서 먼저 업로드 필요
            </span>
          )}
        </p>
        <p>
          <span className={options.length > 0 ? "text-green-700" : "text-orange-700"}>
            {options.length > 0 ? "✅" : "⚠️"}
          </span>{" "}
          pending 큐: <strong>{options.length}건</strong>
          {options.length === 0 && " (블로그 자동 발행 cron 가동 후 자연 채워짐)"}
        </p>
      </div>

      {/* 권장 절차 */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm space-y-2">
        <h2 className="font-bold text-base">권장 절차</h2>
        <ol className="space-y-1 list-decimal list-inside text-blue-900">
          <li>먼저 <strong>「Dry-run 검증」</strong> click — 실제 발행 X, selector 검증만</li>
          <li>성공 시 「디버그 정보」 펼쳐 title=input_ok, body=input_ok 확인</li>
          <li><strong>「실제 발행」</strong> click — 사장님 네이버 블로그에 실 글 1개 게시</li>
          <li>네이버 블로그에서 글 확인 후 OK 면 Vercel env <code>NAVER_CRON_DISABLED=false</code> 로 cron 활성화</li>
        </ol>
        <p className="text-xs text-blue-800 mt-2">
          ⚠️ 실제 발행은 1건만. 큐의 다른 항목은 cron 이 자동 발행 (시간대·jitter·일 cap 적용).
        </p>
      </div>

      {/* form */}
      <div className="rounded-lg border border-grey-200 bg-white p-4">
        <ManualTestForm options={options} />
      </div>
    </div>
  );
}
