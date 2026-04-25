import type { Config } from "tailwindcss";

// ============================================================
// keepioo 디자인 토큰 — Toss Design System (TDS) 정확화
// ============================================================
// 2026-04-25 토스 TDS 가이드 (https://tossmini-docs.toss.im/tds-mobile/foundation/)
// 정확한 hex 값으로 재정렬. 단계 1~3 의 토스 풍 방향은 유지하되
// 임의 추정값(Tailwind 기본 blue)을 토스 공식 팔레트로 교체.
//
// 핵심 통찰:
// - Blue 50 = #e8f3ff (cool tone 더 강조)
// - Grey 단계는 100% 토스와 동일
// - Background 시맨틱: white / greyBackground(#f2f4f6) / floated / layered
// - 카드 분리는 ring 보다 background 차이 + 그림자로
// ============================================================

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Brand Primary — 토스 공식 Blue (10단계 정확값)
        // 출처: @toss/tds-colors 공식 팔레트
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        blue: {
          50:  "#E8F3FF",
          100: "#C9E2FF",
          200: "#90C2FF",
          300: "#64A8FF",
          400: "#4593FC",
          500: "#3182F6",  // ★ primary
          600: "#2272EB",
          700: "#1B64DA",
          800: "#1957C2",
          900: "#194AA6",
        },
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Neutral — 토스 공식 Grey (10단계 정확값)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        grey: {
          50:  "#F9FAFB",
          100: "#F2F4F6",  // greyBackground (페이지 회색 배경)
          200: "#E5E8EB",
          300: "#D1D6DB",
          400: "#B0B8C1",
          500: "#8B95A1",
          600: "#6B7684",
          700: "#4E5968",
          800: "#333D4B",
          900: "#191F28",  // 텍스트 잉크
        },
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 별칭(legacy alias) — 기존 사용처 자동 전환용
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        cream:    "#F9FAFB",
        burgundy: "#3182F6",
        sepia:    "#4E5968",
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 상태 컬러 — 토스 공식 값 (Red/Orange/Green/Yellow/Purple/Teal)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        red:    "#F04452",  // 토스 red500 — 마감 임박, 에러
        orange: "#FE9800",  // 토스 orange500 — 주의, 경고
        green:  "#03B26C",  // 토스 green500 — 성공, 진행 중
        yellow: "#FFC342",  // 토스 yellow500 — 부가 정보
        purple: "#A234C7",  // 토스 purple500 — 정책자료(NewsCard) 등
        teal:   "#18A5A5",  // 토스 teal500 — 보조
      },
      fontFamily: {
        // 토스는 Toss Product Sans 사용 (배포 불가 폰트), 웹은 Pretendard 가
        // 가장 가까운 대체. 본문·헤더·로고 모두 단일 Pretendard 통일.
        pretendard: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Border Radius — 토스 풍 통통한 모서리
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 토스 패턴: 작은 칩 8/12, 일반 카드 16~20, 큰 카드 24~32, hero 32~48
      borderRadius: {
        sm:   "8px",
        md:   "12px",
        lg:   "16px",
        xl:   "20px",
        "2xl": "24px",
        "3xl": "32px",   // 큰 카드 (HomeRecommendCard, BlogCard)
        "4xl": "40px",   // hero 박스, 매우 큰 카드
      },
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Box Shadow — 토스식 가벼운 그림자 (ring 대신 그림자로 분리)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 토스는 매우 가벼운 그림자 + 큰 모서리 + 배경 톤 차이로 깊이 표현.
      // 이전 단계1 의 2레이어 stripe 풍 → 토스 풍 단순한 single layer + 옵션
      // 으로 재정렬. shadow-md 가 카드 기본, shadow-lg 가 hover/floated.
      boxShadow: {
        sm:  "0 1px 2px rgba(17, 24, 39, 0.04)",
        DEFAULT:
          "0 2px 8px rgba(17, 24, 39, 0.06)",
        md:
          "0 4px 16px rgba(17, 24, 39, 0.06)",
        lg:
          "0 8px 24px rgba(17, 24, 39, 0.08)",
        xl:
          "0 16px 40px rgba(17, 24, 39, 0.10)",
        "2xl":
          "0 24px 56px rgba(17, 24, 39, 0.12)",
        // 토스 시그니처 blue glow — 주요 CTA 버튼용
        "blue-glow":
          "0 4px 14px rgba(49, 130, 246, 0.32)",
        "blue-glow-lg":
          "0 8px 24px rgba(49, 130, 246, 0.42)",
      },
      maxWidth: {
        content: "1140px",
      },
    },
  },
  plugins: [],
};

export default config;
