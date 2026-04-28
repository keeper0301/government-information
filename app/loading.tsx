// ============================================================
// 전역 로딩 fallback (app/loading.tsx)
// ============================================================
// Next.js App Router 의 loading convention. force-dynamic 페이지가 첫 paint
// 까지 흰 화면을 보이는 UX 약점 차단.
//
// 2026-04-28 개편 — 외부 LLM 평가 후속:
//   "SSR HTML 에 로딩 텍스트만 보이고 사이트 가치가 안 드러남" 지적.
//   RSC streaming 첫 chunk 에 fallback 이 박혀 일부 크롤러가 본문 못 읽음.
//   해결: 단순 spinner → 사이트 핵심 카피·신뢰 시그널 포함 fallback 으로
//   변경. 크롤러가 첫 chunk 만 읽어도 사이트 정체성 인식 가능.
//
// 디자인:
//   - 토스 grey-50 배경 + 사이트 hero 톤 일관
//   - 한국어 안내 문구 — 사용자 효익 중심 ("정책 정보 큐레이션 중")
//   - 접근성: role=status + aria-live=polite + sr-only 텍스트
// ============================================================

export default function Loading() {
  return (
    <main
      className="min-h-screen bg-grey-50 flex items-center justify-center px-5 py-20"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-[480px] mx-auto text-center">
        {/* 사이트 정체성 — 크롤러가 fallback 만 읽어도 무엇을 하는 사이트인지
            인식할 수 있도록 핵심 카피 노출. h1 으로 SEO 가중치 부여 */}
        <h1 className="text-[24px] font-extrabold tracking-[-0.5px] text-grey-900 mb-3">
          내 조건에 맞는 정부 지원, 30초 만에
        </h1>
        <p className="text-[14px] text-grey-700 leading-[1.6] mb-8">
          청년·소상공인·부모·신혼부부 정책을 한곳에 모아
          <br className="max-md:hidden" />
          이메일·알림톡으로 마감 전에 알려드려요.
        </p>

        {/* 토스 풍 spinner — 16px 굵은 ring + blue-500 강조 + 부드러운 회전 */}
        <div
          className="w-12 h-12 rounded-full border-4 border-grey-200 border-t-blue-500 mx-auto animate-spin"
          aria-hidden="true"
        />
        <p className="mt-5 text-[13px] text-grey-600 font-medium">
          정책 정보를 큐레이션하고 있어요
        </p>
        <span className="sr-only">로딩 중</span>
      </div>
    </main>
  );
}
