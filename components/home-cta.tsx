// ============================================================
// HomeCTA — 페이지 끝 행동 유도 (내러티브 4단계의 "행동")
// ============================================================
// 토스 전략: 내러티브 흐름 마무리 = 사용자에게 다음 행동 명확히 제시.
// keepioo 의 핵심 행동 두 가지:
//   1. 추천 받기 (즉시 가치) → /policy 또는 Hero 의 추천카드
//   2. 알림 설정 (지속 가치) → /signup 회원가입 후 마감 임박 알림
//
// 비주얼: 큰 blue 그라디언트 배경 + 흰 글자 + 두 개 CTA 버튼.
// 첫 화면 옅은 blue 톤과 반전된 진한 blue 로 페이지 끝 임팩트 강조.
// ============================================================

import Link from "next/link";

export function HomeCTA() {
  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-20 max-md:py-12">
      <div
        className="relative overflow-hidden rounded-3xl px-12 py-16 max-md:px-7 max-md:py-12 shadow-xl"
        style={{
          background: "linear-gradient(135deg, #3182F6 0%, #1957C2 100%)",
        }}
      >
        {/* 우상단 옅은 흰 blob — 토스 풍 깊이감 */}
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
          }}
        />

        <div className="relative z-10 text-center">
          <p className="text-[14px] font-semibold text-white/80 tracking-[0.18em] mb-4">
            START NOW
          </p>
          <h2 className="text-[36px] max-md:text-[26px] font-extrabold text-white leading-[1.2] tracking-[-1.5px] mb-4">
            받을 수 있는 혜택,
            <br />
            지금 30초 안에 확인하세요
          </h2>
          <p className="text-[16px] max-md:text-[14px] text-white/85 leading-[1.65] mb-10 max-md:mb-7 max-w-[480px] mx-auto">
            매일 새로 추가되는 정부·지자체 지원 정책 중 내 조건에 맞는 것을
            놓치지 않게, 이메일·알림톡으로 보내드려요.
          </p>

          <div className="flex items-center justify-center gap-3 max-md:flex-col max-md:gap-2">
            <Link
              href="/policy"
              className="inline-flex items-center justify-center h-14 px-8 max-md:w-full max-md:h-12 max-md:px-6 rounded-2xl bg-white text-blue-700 text-[16px] font-bold no-underline hover:bg-blue-50 active:scale-[0.98] transition-all shadow-md"
            >
              지금 내 혜택 찾기 →
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center h-14 px-8 max-md:w-full max-md:h-12 max-md:px-6 rounded-2xl bg-blue-700/30 text-white text-[16px] font-semibold no-underline hover:bg-blue-700/50 active:scale-[0.98] transition-all border border-white/30"
            >
              알림 받기 (회원가입)
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
