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
        className="relative overflow-hidden rounded-3xl px-12 py-16 max-md:px-7 max-md:py-12"
        style={{
          // 사이트 hero 와 동일 계열 옅은 블루. 강한 임팩트 대신
          // 자연스러운 톤으로 페이지 끝까지 사이트 분위기 유지.
          background: "linear-gradient(135deg, #E8F3FF 0%, #C9E2FF 100%)",
        }}
      >
        {/* 우상단 옅은 blob — 토스 풍 깊이감 (이제 흰색 → 더 옅은 블루) */}
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(49,130,246,0.10) 0%, rgba(49,130,246,0) 70%)",
          }}
        />

        <div className="relative z-10 text-center">
          <p className="text-[14px] font-semibold text-blue-500 tracking-[0.18em] mb-4">
            START NOW
          </p>
          <h2 className="text-[36px] max-md:text-[26px] font-extrabold text-grey-900 leading-[1.2] tracking-[-1.5px] mb-4">
            조건 맞는 정책,
            <br />
            매주 이메일로 알려드려요
          </h2>
          <p className="text-[16px] max-md:text-[14px] text-grey-700 leading-[1.65] mb-10 max-md:mb-7 max-w-[480px] mx-auto">
            한 번만 등록해두면 새 공고가 올라올 때마다 자동으로 매칭해드려요.
            마감 임박 D-3 알림도 함께.
          </p>

          {/* 회원가입을 1차 CTA 로 (매주 이메일 알림 가치 강조).
              "먼저 둘러보기" 는 2차로 — 직진형 → 탐색형 흐름. */}
          <div className="flex items-center justify-center gap-3 max-md:flex-col max-md:gap-2">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center h-14 px-8 max-md:w-full max-md:h-12 max-md:px-6 rounded-2xl bg-blue-500 text-white text-[16px] font-bold no-underline hover:bg-blue-600 active:scale-[0.98] transition-all shadow-blue-glow"
            >
              회원가입하고 알림 받기 →
            </Link>
            <Link
              href="/policy"
              className="inline-flex items-center justify-center h-14 px-8 max-md:w-full max-md:h-12 max-md:px-6 rounded-2xl bg-white text-blue-600 text-[16px] font-semibold no-underline hover:bg-blue-50 active:scale-[0.98] transition-all"
            >
              먼저 둘러보기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
