// ============================================================
// HiddenNotice — 비공개 뉴스에 접근한 "일반 사용자" 에게 보여주는 안내 화면
// ============================================================
// 스펙: docs/superpowers/specs/2026-04-25-news-moderation-design.md 3.2
//
// App Router 페이지에서 임의 status code 반환이 제한적이라 엄밀한 410 Gone
// 대신 200 OK + robots noindex,nofollow + 사용자 안내 UI 로 단순화. 검색
// 엔진 인덱스 제거 효과는 robots 시그널로 커버되고, sitemap 은 RLS 에 의해
// 자동으로 hidden row 를 제외한다.
// ============================================================

import Link from "next/link";

export function HiddenNewsNotice() {
  return (
    <main className="pt-28 pb-20 max-w-[560px] mx-auto px-10 max-md:px-6 text-center">
      <p className="text-[13px] font-semibold tracking-[0.15em] text-grey-600 uppercase mb-3">
        NOT AVAILABLE
      </p>
      <h1 className="text-[26px] font-bold tracking-[-0.6px] text-grey-900 mb-4 max-md:text-[22px]">
        이 뉴스는 현재 비공개 상태입니다
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.7] mb-8 max-md:text-[14px]">
        운영 정책에 따라 이 정책 소식은 현재 노출하고 있지 않아요.
        다른 최신 정책 소식은 아래 버튼에서 확인할 수 있어요.
      </p>
      <Link
        href="/news"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-6 bg-blue-500 text-white text-[14px] font-semibold rounded-lg no-underline hover:bg-blue-600"
      >
        → 정책 소식 목록 보기
      </Link>
    </main>
  );
}
