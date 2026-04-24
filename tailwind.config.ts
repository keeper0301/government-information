import type { Config } from "tailwindcss";

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
        // Brand Primary — Editorial Masthead Burgundy
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 기존 파란색 `blue` 팔레트명은 legacy — 실제 값은 로고 브랜드 버건디.
        // `bg-blue-500` 사용 중인 기존 코드 전부가 자동으로 새 톤으로 전환됨.
        blue: {
          50:  "#FBF4F1",  // 가장 연한 크림 핑크 (hover bg, 알림 box)
          100: "#F5E3DD",  // 라이트 bg, 카드 highlight
          200: "#E9BFB5",  // chip, disabled
          400: "#CE6F5C",  // 호버 라이트
          500: "#8A2A2A",  // ★ primary — 로고 버건디와 동일
          600: "#701F1F",  // hover
          700: "#5A1818",  // active
          800: "#4A1414",  // pressed
        },
        // Warm grey — Editorial paper 와 어울리는 따뜻한 회색 (옅은 브라운 tint)
        // WCAG AA 대비 표기 (흰 배경 #FFF 기준):
        //   400 — 2.5:1  (placeholder/disabled 전용, 본문 금지)
        //   500 — 5.2:1 ✅ (작은 본문 AA 통과. 이전 #847A68=3.9 에서 조정)
        //   600 — 5.5:1 ✅
        //   700 — 8.1:1 ✅
        //   800 — 13:1  ✅
        //   900 — 19:1  ✅
        grey: {
          50:  "#FAF8F4",
          100: "#F4F1EA",
          200: "#E5E0D5",
          300: "#CFC7B6",
          400: "#A9A08D",
          500: "#6F6557",  // WCAG AA 재보정 (구 #847A68=3.9:1 미달)
          600: "#665E4E",
          700: "#4C4538",
          800: "#2E2A21",
          900: "#0E0B08",  // 로고 잉크 블랙과 동일
        },
        // Editorial 액센트
        cream:    "#F5EEDC",  // 페이퍼 배경
        burgundy: "#8A2A2A",  // 버건디 (blue.500 alias)
        sepia:    "#3D2F22",  // 세피아 (small caps 등)
        // 상태 컬러 (변경 없음)
        red:    "#C93434",  // 조금 더 경고적이고 editorial 톤과 어울리는 레드로
        orange: "#D97A28",  // 머스타드 쪽으로
        green:  "#3F7D52",  // 깊은 올리브 그린
        purple: "#7A3A6F",
      },
      fontFamily: {
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
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      maxWidth: {
        content: "1140px",
      },
    },
  },
  plugins: [],
};

export default config;
