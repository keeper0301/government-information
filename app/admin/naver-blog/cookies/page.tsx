// ============================================================
// /admin/naver-blog/cookies — 네이버 세션 cookies 업로드 페이지
// ============================================================
// 사장님 Chrome 에서 export 한 네이버 cookies 를 vault 에 저장.
// Phase 3 cron 이 이 cookies 로 Playwright RPA 실행.
//
// 3-step 매뉴얼 (사장님 비개발자 친화):
//   1. naver.com 에 사장님 평소 Chrome 으로 로그인
//   2. F12 → Application → Cookies → https://www.naver.com
//   3. 모든 cookies 선택 → 우클릭 "Copy as JSON" (또는 확장 사용)
//   4. 아래 박스에 붙여넣기 → "저장" click
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getActiveCookies } from "@/lib/naver-blog/cookies-vault";
import { CookiesUploadForm } from "./cookies-upload-form";

export const metadata: Metadata = {
  title: "네이버 세션 cookies | 어드민",
};

export const dynamic = "force-dynamic";

export default async function NaverCookiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user.email)) {
    redirect("/");
  }

  let active = null;
  let loadError: string | null = null;
  try {
    active = await getActiveCookies();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  // 만료 임박 D-N 계산 — server component 이라 매 req render = 안전한 시점에 호출.
  // eslint-disable-next-line react-hooks/purity -- async server component 안의 시간 계산
  const nowMs = Date.now();
  let daysUntilExpiry: number | null = null;
  if (active?.expiresMin) {
    const ms = new Date(active.expiresMin).getTime() - nowMs;
    daysUntilExpiry = Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="네이버 세션 cookies"
        description="네이버 블로그 RPA 자동 발행용 세션 저장소"
      />

      {/* 현재 상태 카드 */}
      <div className="bg-white border border-grey-200 rounded-lg p-4">
        <h2 className="font-bold text-lg mb-3">현재 active 세션</h2>
        {loadError && (
          <div className="text-red-600 text-sm">
            ⚠️ {loadError}
            <p className="text-grey-600 mt-1">
              마이그레이션 087 이 prod 에 미적용 상태일 수 있어요.
            </p>
          </div>
        )}
        {!loadError && !active && (
          <div className="text-grey-600 text-sm">
            저장된 cookies 없음. 아래 박스에 입력해주세요.
          </div>
        )}
        {active && (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-grey-600">업로드 시점:</span>{" "}
              {new Date(active.uploadedAt).toLocaleString("ko-KR")}
            </p>
            <p>
              <span className="text-grey-600">cookies 갯수:</span>{" "}
              <strong>{active.cookies.length}개</strong>
            </p>
            <p>
              <span className="text-grey-600">만료까지:</span>{" "}
              {daysUntilExpiry !== null ? (
                <strong
                  className={
                    daysUntilExpiry < 7
                      ? "text-red-600"
                      : daysUntilExpiry < 30
                        ? "text-orange-600"
                        : "text-green-600"
                  }
                >
                  {daysUntilExpiry < 0 ? "만료됨" : `D-${daysUntilExpiry}`}
                </strong>
              ) : (
                <span className="text-grey-500">session cookies (정확한 만료 없음)</span>
              )}
            </p>
            {active.notes && (
              <p>
                <span className="text-grey-600">메모:</span> {active.notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3-step 매뉴얼 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-bold text-lg mb-3">📋 cookies 재발급 4-step 매뉴얼</h2>
        <ol className="space-y-2 text-sm">
          <li>
            <strong>1️⃣ Chrome 으로</strong>{" "}
            <a
              href="https://www.naver.com"
              target="_blank"
              rel="noopener"
              className="text-blue-600 underline"
            >
              naver.com
            </a>{" "}
            에 사장님 평소 계정으로 로그인 (캡차·2FA 정상 통과).
          </li>
          <li>
            <strong>2️⃣ F12</strong> 누르면 DevTools 열림 → 상단 탭에서{" "}
            <code className="bg-grey-100 px-1 rounded">Application</code> 클릭 → 왼쪽
            메뉴에서 <code className="bg-grey-100 px-1 rounded">Cookies</code> 펼치기
            → <code className="bg-grey-100 px-1 rounded">https://www.naver.com</code>{" "}
            선택.
          </li>
          <li>
            <strong>3️⃣ 표 안의 모든 cookies 선택</strong> (Ctrl+A) →{" "}
            <strong>우클릭 → &quot;Copy as JSON&quot;</strong>{" "}
            (또는 Chrome 확장 &ldquo;EditThisCookie&rdquo; 사용).
          </li>
          <li>
            <strong>4️⃣ 아래 박스에 붙여넣기</strong> → <strong>저장</strong> click.
          </li>
        </ol>
        <p className="text-xs text-grey-600 mt-3">
          ⚠️ 핵심 인증 cookies: <code>NID_AUT</code>, <code>NID_SES</code>. 이 두
          개가 없으면 검증 실패 (로그인 상태에서 export 안 했다는 신호).
        </p>
      </div>

      {/* 업로드 form */}
      <div className="bg-white border border-grey-200 rounded-lg p-4">
        <h2 className="font-bold text-lg mb-3">🔑 새 cookies 업로드</h2>
        <CookiesUploadForm />
      </div>
    </div>
  );
}
