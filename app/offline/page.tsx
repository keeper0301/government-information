// keepioo offline fallback 페이지.
//
// 역할:
//  · service worker 가 fetch 실패 시 (네트워크 끊김) 표시
//  · 캐시된 페이지가 있으면 그것을 우선 반환, 없으면 이 페이지
//  · 비로그인/로그인 상태 무관 — 단순 안내 only
//
// SEO:
//  · robots noindex — 검색엔진 색인 차단 (오프라인 안내는 색인 가치 0)

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "오프라인 — keepioo",
  description: "인터넷 연결이 끊겼습니다.",
  robots: { index: false, follow: false },
};

// 정적 prerender — sw 가 install 시 미리 캐시할 수 있도록 빌드 시 고정
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 bg-grey-50">
      <div className="text-center max-w-md">
        <p className="text-5xl mb-4" aria-hidden>
          📡
        </p>
        <h1 className="text-2xl font-extrabold text-grey-900 mb-3">
          오프라인 모드
        </h1>
        <p className="text-sm text-grey-700 leading-[1.6] mb-6">
          인터넷 연결이 끊겼어요. 캐시된 페이지만 이용 가능합니다.
          <br />
          다시 연결되면 자동으로 최신 정보로 업데이트돼요.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-3 bg-blue-500 text-white rounded-lg text-base font-bold no-underline hover:bg-blue-600"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
