# Phase 1: 프로젝트 초기화 + 홈페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 14 프로젝트를 생성하고, 토스 디자인 시스템 토큰을 적용하여 정책알리미 홈페이지를 완성한다.

**Architecture:** Next.js App Router + Tailwind CSS로 정적 홈페이지 구현. 토스 디자인 토큰(색상, 타이포, 간격, 레이디우스)을 Tailwind config에 정의. 공통 레이아웃(Nav, Footer, FAB)을 분리하고 홈페이지 섹션별 컴포넌트로 분할. 데이터는 Phase 2에서 연동하므로 이 단계에서는 하드코딩된 mock 데이터 사용.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS, Pretendard Variable, @next/third-parties/google

**Design mockup:** `.superpowers/brainstorm/1198-1774664888/content/toss-homepage-v5.html`
**Design spec:** `docs/superpowers/specs/2026-03-28-jungcheck-allimi-design.md`

---

## File Structure

```
정책알리미/
├── app/
│   ├── layout.tsx            # 루트 레이아웃 (html, body, fonts, Nav, Footer, FAB, GA)
│   ├── page.tsx              # 홈페이지
│   └── globals.css           # Tailwind directives + global styles
├── components/
│   ├── nav.tsx               # 네비게이션 바
│   ├── footer.tsx            # 푸터
│   ├── chatbot-fab.tsx       # 챗봇 플로팅 버튼
│   ├── search-box.tsx        # 히어로 검색 박스
│   ├── alert-strip.tsx       # 마감임박 배너
│   ├── program-list.tsx      # 복지/대출 리스트 (ListRow 패턴)
│   ├── program-row.tsx       # 개별 ListRow 아이템
│   ├── calendar-preview.tsx  # 달력 프리뷰
│   ├── feature-grid.tsx      # "이렇게 도와드려요" 3칸 그리드
│   ├── ad-slot.tsx           # AdSense 광고 슬롯
│   └── icons.tsx             # SVG 아이콘 컴포넌트들 (벨, 집, 서류가방 등)
├── lib/
│   └── mock-data.ts          # 하드코딩 mock 복지/대출 데이터
├── tailwind.config.ts        # 토스 디자인 토큰
├── next.config.ts            # Next.js 설정
├── package.json
└── tsconfig.json
```

---

### Task 1: 프로젝트 초기화

**Files:**
- Create: 전체 프로젝트 구조 (create-next-app이 생성)
- Modify: `tailwind.config.ts` (토스 디자인 토큰 추가)
- Modify: `app/globals.css` (Pretendard 폰트 + 기본 스타일)
- Modify: `app/layout.tsx` (lang="ko", 폰트 설정)

- [ ] **Step 1: Git 초기화 + Next.js 프로젝트 생성**

```bash
cd C:/Users/cgc09/projects/government_information
git init
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
```

Expected: Next.js 프로젝트 파일들이 현재 디렉토리에 생성됨.

- [ ] **Step 2: .gitignore에 .superpowers 추가**

`.gitignore` 파일 끝에 추가:
```
.superpowers/
```

- [ ] **Step 3: tailwind.config.ts에 토스 디자인 토큰 설정**

```typescript
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
        blue: {
          50: "#e8f3ff",
          100: "#c9e2ff",
          200: "#90c2ff",
          400: "#4da2ff",
          500: "#3182f6",
          600: "#1b64da",
          700: "#1957c2",
          800: "#194aa6",
        },
        grey: {
          50: "#f9fafb",
          100: "#f2f4f6",
          200: "#e5e8eb",
          300: "#d1d6db",
          400: "#b0b8c1",
          500: "#8b95a1",
          600: "#6b7684",
          700: "#4e5968",
          800: "#333d4b",
          900: "#191f28",
        },
        red: "#f04452",
        orange: "#fe9800",
        green: "#03b26c",
        purple: "#a234c7",
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
```

- [ ] **Step 4: globals.css 설정**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css");

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  word-break: keep-all;
  overflow-wrap: break-word;
}

body {
  font-family: "Pretendard Variable", Pretendard, -apple-system,
    BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR",
    "Malgun Gothic", sans-serif;
  color: #191f28;
  background: #fff;
}
```

- [ ] **Step 5: 루트 레이아웃 기본 설정**

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정책알리미 — 나에게 맞는 복지·대출 정보",
  description:
    "복지로·소상공인24·금융위원회 데이터를 한곳에. 맞춤 복지·대출 정보를 찾고, 마감 알림을 받아보세요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공, 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "chore: initialize Next.js project with Toss design tokens"
```

---

### Task 2: SVG 아이콘 컴포넌트

**Files:**
- Create: `components/icons.tsx`

- [ ] **Step 1: 아이콘 컴포넌트 파일 생성**

`components/icons.tsx`:
```tsx
type IconProps = {
  className?: string;
};

export function BellIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="M16 5a7 7 0 00-7 7v5l-2 3h18l-2-3v-5a7 7 0 00-7-7z"
        fill="currentColor"
      />
      <circle cx="16" cy="24" r="2" fill="currentColor" />
    </svg>
  );
}

export function HouseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V19a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1V9.5" />
    </svg>
  );
}

export function BriefcaseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
      <path d="M2 13h20" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21C12 21 3 13.5 3 8.5a4 4 0 017.5-2L12 8l1.5-1.5A4 4 0 0121 8.5C21 13.5 12 21 12 21z" />
    </svg>
  );
}

export function MedicalIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function CoinIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M15 9.5a6 6 0 110 5" />
      <path d="M9 7v4l2 1" />
    </svg>
  );
}

export function StoreIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" />
      <path d="M9 20v-7h6v7" />
    </svg>
  );
}

export function ShieldCheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l8 4v5c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="14" y2="14" />
    </svg>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/icons.tsx
git commit -m "feat: add SVG icon components for categories"
```

---

### Task 3: Mock 데이터

**Files:**
- Create: `lib/mock-data.ts`

- [ ] **Step 1: mock 데이터 파일 생성**

`lib/mock-data.ts`:
```typescript
export type Program = {
  id: string;
  title: string;
  category: string;
  target: string;
  description: string;
  amount: string;
  source: string;
  dday: number | null; // null = 상시
  icon: "house" | "briefcase" | "heart" | "medical" | "coin" | "store" | "shield";
};

export const welfarePrograms: Program[] = [
  {
    id: "w1",
    title: "청년 월세 특별지원",
    category: "주거",
    target: "청년",
    description: "월 최대 20만원 · 12개월 지원 · 연소득 5천만원 이하 무주택 청년",
    amount: "월 20만원",
    source: "복지로",
    dday: 7,
    icon: "house",
  },
  {
    id: "w2",
    title: "국민취업지원제도 II유형",
    category: "취업",
    target: "전체",
    description: "구직촉진수당 월 50만원 × 6개월 · 취업활동비용 및 직업훈련 지원",
    amount: "월 50만원",
    source: "고용노동부",
    dday: null,
    icon: "briefcase",
  },
  {
    id: "w3",
    title: "부모급여 (0~1세)",
    category: "양육",
    target: "부모",
    description: "0세 월 100만원, 1세 월 50만원 · 출생신고 후 주민센터 신청",
    amount: "월 100만원",
    source: "보건복지부",
    dday: null,
    icon: "heart",
  },
  {
    id: "w4",
    title: "긴급복지 의료지원",
    category: "의료",
    target: "저소득",
    description: "위기상황 시 의료비 최대 300만원 · 입원·수술비 긴급 지원",
    amount: "최대 300만원",
    source: "복지로",
    dday: 30,
    icon: "medical",
  },
];

export const loanPrograms: Program[] = [
  {
    id: "l1",
    title: "소상공인 정책자금",
    category: "대출",
    target: "소상공인",
    description: "일반경영안정자금 · 5년 거치 5년 분할상환",
    amount: "최대 1억 · 연 2.0%",
    source: "소상공인진흥공단",
    dday: 21,
    icon: "coin",
  },
  {
    id: "l2",
    title: "경영안정자금 특별지원",
    category: "지원금",
    target: "자영업",
    description: "매출 감소 자영업자 대상 · 초저금리 지원",
    amount: "최대 5천만 · 연 1.5%",
    source: "금융위원회",
    dday: 5,
    icon: "store",
  },
  {
    id: "l3",
    title: "소상공인 신용보증",
    category: "보증",
    target: "창업",
    description: "업력 7년 이내 창업기업 대상 · 보증료 0.5%",
    amount: "최대 2억",
    source: "소상공인24",
    dday: null,
    icon: "shield",
  },
];

export const searchTags = [
  "청년 월세",
  "소상공인 대출",
  "창업 지원금",
  "긴급복지",
  "경영안정자금",
];
```

- [ ] **Step 2: 커밋**

```bash
git add lib/mock-data.ts
git commit -m "feat: add mock welfare and loan program data"
```

---

### Task 4: 공통 컴포넌트 (Nav, Footer, FAB)

**Files:**
- Create: `components/nav.tsx`
- Create: `components/footer.tsx`
- Create: `components/chatbot-fab.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Nav 컴포넌트**

`components/nav.tsx`:
```tsx
import { BellIcon } from "./icons";

const navItems = [
  { label: "복지정보", href: "/welfare", active: true },
  { label: "대출정보", href: "/loan", active: false },
  { label: "달력", href: "/calendar", active: false },
  { label: "블로그", href: "/blog", active: false },
];

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-grey-100">
      <div className="max-w-content mx-auto px-10 h-[58px] flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 no-underline">
          <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 grid place-items-center">
            <BellIcon className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="text-[18px] font-extrabold tracking-[-0.6px] text-grey-900">
            정책알리미
          </span>
        </a>
        <div className="hidden md:flex items-center gap-0.5">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`px-3.5 py-2 text-[15px] rounded-lg transition-colors ${
                item.active
                  ? "font-semibold text-grey-900"
                  : "font-medium text-grey-700 hover:bg-grey-50 hover:text-grey-900"
              }`}
            >
              {item.label}
            </a>
          ))}
          <button className="ml-3 px-4 py-[7px] text-sm font-semibold text-blue-500 bg-blue-50 border-none rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
            로그인
          </button>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Footer 컴포넌트**

`components/footer.tsx`:
```tsx
const footerLinks = [
  { label: "이용약관", href: "#" },
  { label: "개인정보처리방침", href: "#" },
  { label: "문의", href: "#" },
];

export function Footer() {
  return (
    <footer className="max-w-content mx-auto px-10 pt-12 pb-[60px] max-md:px-6 max-md:pt-10 max-md:pb-12">
      <div className="flex justify-between mb-5 max-md:flex-col max-md:gap-4">
        <div className="text-[15px] font-bold text-grey-800">정책알리미</div>
        <div className="flex gap-5">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13px] text-grey-500 no-underline hover:text-grey-700 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <div className="text-xs text-grey-400 leading-[1.7]">
        공공기관 데이터 기반 복지·대출 정보 안내 서비스
        <br />
        데이터 출처: 복지로, 소상공인24, 소상공인시장진흥공단, 금융위원회,
        공공데이터포털
        <br />본 서비스는 정보 안내 목적이며, 실제 신청은 각 기관 공식
        사이트에서 진행됩니다.
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: ChatbotFab 컴포넌트**

`components/chatbot-fab.tsx`:
```tsx
import { ChatIcon } from "./icons";

export function ChatbotFab() {
  return (
    <button
      className="fixed bottom-7 right-7 z-40 w-[54px] h-[54px] bg-grey-900 rounded-full grid place-items-center cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-[1.06] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-none"
      aria-label="챗봇 열기"
    >
      <ChatIcon className="w-[22px] h-[22px] text-white" />
    </button>
  );
}
```

- [ ] **Step 4: 레이아웃에 Nav, Footer, FAB 통합**

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ChatbotFab } from "@/components/chatbot-fab";
import "./globals.css";

export const metadata: Metadata = {
  title: "정책알리미 — 나에게 맞는 복지·대출 정보",
  description:
    "복지로·소상공인24·금융위원회 데이터를 한곳에. 맞춤 복지·대출 정보를 찾고, 마감 알림을 받아보세요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Nav />
        {children}
        <Footer />
        <ChatbotFab />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add components/nav.tsx components/footer.tsx components/chatbot-fab.tsx app/layout.tsx
git commit -m "feat: add Nav, Footer, and ChatbotFab layout components"
```

---

### Task 5: 홈페이지 섹션 컴포넌트들

**Files:**
- Create: `components/search-box.tsx`
- Create: `components/alert-strip.tsx`
- Create: `components/program-row.tsx`
- Create: `components/program-list.tsx`
- Create: `components/calendar-preview.tsx`
- Create: `components/feature-grid.tsx`
- Create: `components/ad-slot.tsx`

- [ ] **Step 1: SearchBox 컴포넌트**

`components/search-box.tsx`:
```tsx
import { SearchIcon } from "./icons";
import { searchTags } from "@/lib/mock-data";

export function SearchBox() {
  return (
    <div>
      <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-grey-200 rounded-lg p-1.5 pl-5 max-w-[560px] transition-all focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(49,130,246,0.12)]">
        <input
          type="text"
          placeholder="찾고 싶은 복지·대출 정보를 검색하세요"
          className="flex-1 border-none outline-none bg-transparent text-base text-grey-900 font-pretendard min-w-0 placeholder:text-grey-400"
        />
        <button className="shrink-0 px-[22px] py-2.5 bg-blue-500 text-white border-none rounded-md text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors">
          검색
        </button>
      </div>
      <div className="flex gap-1.5 mt-3.5 flex-wrap">
        {searchTags.map((tag) => (
          <span
            key={tag}
            className="text-[13px] font-medium text-grey-600 bg-grey-50 border border-grey-100 px-3 py-[5px] rounded-full cursor-pointer hover:bg-grey-100 hover:text-grey-800 transition-all"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: AlertStrip 컴포넌트**

`components/alert-strip.tsx`:
```tsx
export function AlertStrip() {
  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6">
      <div className="flex items-center border-b border-grey-100 py-[18px] gap-3.5 cursor-pointer hover:opacity-75 transition-opacity">
        <span className="shrink-0 text-xs font-bold text-white bg-red rounded-[5px] px-2 py-[3px]">
          D-3
        </span>
        <span className="flex-1 text-[15px] font-medium text-grey-800 truncate">
          2026 청년 주거안정 월세지원 신청이 3일 후 마감됩니다
        </span>
        <span className="shrink-0 text-[13px] font-medium text-grey-500">
          3.31 마감
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ProgramRow 컴포넌트**

`components/program-row.tsx`:
```tsx
import {
  HouseIcon,
  BriefcaseIcon,
  HeartIcon,
  MedicalIcon,
  CoinIcon,
  StoreIcon,
  ShieldCheckIcon,
} from "./icons";
import type { Program } from "@/lib/mock-data";

const iconMap = {
  house: HouseIcon,
  briefcase: BriefcaseIcon,
  heart: HeartIcon,
  medical: MedicalIcon,
  coin: CoinIcon,
  store: StoreIcon,
  shield: ShieldCheckIcon,
};

function DdayLabel({ dday }: { dday: number | null }) {
  if (dday === null) {
    return (
      <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-grey-100 text-grey-600">
        상시
      </span>
    );
  }
  if (dday <= 7) {
    return (
      <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#FFEEEE] text-red">
        D-{dday}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
      D-{dday}
    </span>
  );
}

export function ProgramRow({ program }: { program: Program }) {
  const Icon = iconMap[program.icon];

  return (
    <a
      href="#"
      className="flex items-center gap-4 py-[18px] border-b border-grey-100 last:border-b-0 cursor-pointer no-underline text-inherit transition-colors hover:bg-grey-50 hover:mx-[-12px] hover:px-3 hover:rounded-xl"
    >
      <div className="shrink-0 w-10 h-10 bg-grey-100 rounded-[11px] grid place-items-center">
        <Icon className="w-5 h-5 text-grey-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-[3px]">
          <div className="text-base font-semibold text-grey-900 tracking-[-0.3px]">
            {program.title}
          </div>
          <DdayLabel dday={program.dday} />
        </div>
        <div className="text-sm text-grey-600 leading-[1.45] truncate">
          {program.description}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-bold text-grey-900 tracking-[-0.3px] mb-0.5">
          {program.amount}
        </div>
        <div className="text-xs text-grey-500">{program.source}</div>
      </div>
    </a>
  );
}
```

- [ ] **Step 4: ProgramList 컴포넌트**

`components/program-list.tsx`:
```tsx
import { ProgramRow } from "./program-row";
import type { Program } from "@/lib/mock-data";

type Props = {
  title: string;
  programs: Program[];
  moreHref: string;
};

export function ProgramList({ title, programs, moreHref }: Props) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="text-[22px] font-bold tracking-[-0.6px] text-grey-900">
          {title}
        </h2>
        <a
          href={moreHref}
          className="text-sm font-medium text-grey-500 no-underline hover:text-blue-500 transition-colors"
        >
          전체보기
        </a>
      </div>
      <div className="flex flex-col">
        {programs.map((p) => (
          <ProgramRow key={p.id} program={p} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: CalendarPreview 컴포넌트**

`components/calendar-preview.tsx`:
```tsx
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const deadlines: Record<number, "blue" | "red" | "green"> = {
  10: "blue",
  14: "green",
  20: "blue",
  31: "red",
};

export function CalendarPreview() {
  const today = 28;
  const emptyDays = 6; // March 2026 starts on Sunday=0, so 6 empty cells before day 1 (Saturday)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="text-[22px] font-bold tracking-[-0.6px] text-grey-900">
          3월 신청 마감 달력
        </h2>
        <a
          href="/calendar"
          className="text-sm font-medium text-grey-500 no-underline hover:text-blue-500 transition-colors"
        >
          달력 전체보기
        </a>
      </div>
      <div className="grid grid-cols-7 gap-0.5 bg-grey-100 rounded-lg overflow-hidden">
        {DAYS.map((d) => (
          <div
            key={d}
            className="bg-grey-50 py-2.5 text-center text-xs font-semibold text-grey-500"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: emptyDays }).map((_, i) => (
          <div key={`e${i}`} className="bg-grey-50 min-h-[68px]" />
        ))}
        {Array.from({ length: 31 }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const dot = deadlines[day];
          return (
            <div
              key={day}
              className={`relative bg-white p-2.5 pb-3.5 min-h-[68px] text-[13px] font-medium text-right ${
                isToday ? "bg-blue-50" : ""
              }`}
            >
              <span className={isToday ? "text-blue-500 font-bold" : "text-grey-800"}>
                {day}
              </span>
              {dot && (
                <span
                  className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full ${
                    dot === "blue"
                      ? "bg-blue-500"
                      : dot === "red"
                      ? "bg-red"
                      : "bg-green"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: FeatureGrid 컴포넌트**

`components/feature-grid.tsx`:
```tsx
const features = [
  {
    num: "01",
    title: "조건에 맞는\n혜택만 보여드려요",
    desc: "나이, 지역, 직업 정보를 입력하면 받을 수 있는 복지와 대출만 필터링합니다.",
  },
  {
    num: "02",
    title: "마감 전에\n이메일로 알려드려요",
    desc: "관심 있는 사업을 등록하면 신청 마감 7일 전에 이메일 알림을 보내드립니다.",
  },
  {
    num: "03",
    title: "모르는 건\n챗봇에게 물어보세요",
    desc: "자격 요건이 헷갈릴 때, 챗봇이 해당 프로그램 정보를 바탕으로 안내합니다.",
  },
];

export function FeatureGrid() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[22px] font-bold tracking-[-0.6px] text-grey-900">
          이렇게 도와드려요
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-px bg-grey-200 rounded-2xl overflow-hidden max-md:grid-cols-1">
        {features.map((f) => (
          <div key={f.num} className="bg-white p-9 px-7">
            <div className="text-[13px] font-bold text-blue-500 mb-3.5">
              {f.num}
            </div>
            <div className="text-[17px] font-bold text-grey-900 tracking-[-0.4px] mb-2 leading-[1.4] whitespace-pre-line">
              {f.title}
            </div>
            <div className="text-sm text-grey-600 leading-[1.6]">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: AdSlot 컴포넌트**

`components/ad-slot.tsx`:
```tsx
export function AdSlot() {
  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6">
      <div className="border-t border-b border-grey-100 py-4 text-center text-xs text-grey-400">
        광고
      </div>
    </div>
  );
}
```

- [ ] **Step 8: 커밋**

```bash
git add components/search-box.tsx components/alert-strip.tsx components/program-row.tsx components/program-list.tsx components/calendar-preview.tsx components/feature-grid.tsx components/ad-slot.tsx
git commit -m "feat: add homepage section components"
```

---

### Task 6: 홈페이지 조립

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 홈페이지 구현**

`app/page.tsx`:
```tsx
import { SearchBox } from "@/components/search-box";
import { AlertStrip } from "@/components/alert-strip";
import { ProgramList } from "@/components/program-list";
import { CalendarPreview } from "@/components/calendar-preview";
import { FeatureGrid } from "@/components/feature-grid";
import { AdSlot } from "@/components/ad-slot";
import { welfarePrograms, loanPrograms } from "@/lib/mock-data";

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-40 pb-[100px] px-10 max-w-content mx-auto max-md:pt-[120px] max-md:pb-[60px] max-md:px-6">
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 mb-6 before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-blue-500 before:opacity-[0.55]">
          실시간 공공데이터 연동
        </div>
        <h1 className="text-[48px] font-bold leading-[1.3] tracking-[-1.8px] text-grey-900 mb-5 max-md:text-[32px] max-md:tracking-[-1.2px]">
          받을 수 있는 혜택,
          <br />
          놓치고 있지 않나요
        </h1>
        <p className="text-lg leading-[1.7] text-grey-600 max-w-[480px] tracking-[-0.2px] mb-10 max-md:text-base">
          복지로·소상공인24·금융위원회 데이터를 한곳에 모았습니다.
          <br />
          30초 만에 나에게 맞는 지원사업을 찾아보세요.
        </p>
        <SearchBox />
      </section>

      {/* Alert */}
      <AlertStrip />

      {/* Welfare */}
      <div className="bg-grey-50">
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <ProgramList
            title="지금 신청 가능한 복지"
            programs={welfarePrograms}
            moreHref="/welfare"
          />
        </section>
      </div>

      {/* Ad */}
      <AdSlot />

      {/* Loans */}
      <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
        <ProgramList
          title="소상공인 대출·지원금"
          programs={loanPrograms}
          moreHref="/loan"
        />
      </section>

      {/* Calendar */}
      <div className="bg-grey-50">
        <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
          <CalendarPreview />
        </section>
      </div>

      {/* Features */}
      <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
        <FeatureGrid />
      </section>

      {/* Ad */}
      <AdSlot />
    </main>
  );
}
```

- [ ] **Step 2: dev 서버로 확인**

```bash
npm run dev
```

Expected: `http://localhost:3000`에서 홈페이지가 정상 렌더링. Nav, 히어로, 검색, 마감배너, 복지 리스트, 광고, 대출 리스트, 달력, 기능 안내, 광고, 푸터, 챗봇 FAB 확인.

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공, 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: assemble homepage with all sections"
```

---

### Task 7: 최종 정리 + GA/AdSense 준비

**Files:**
- Modify: `app/layout.tsx` (Google Analytics 스크립트 준비)

- [ ] **Step 1: @next/third-parties 설치**

```bash
npm install @next/third-parties
```

- [ ] **Step 2: layout.tsx에 GA 준비 (ID는 나중에 교체)**

`app/layout.tsx` 수정 — 상단에 import 추가:
```tsx
import { GoogleAnalytics } from "@next/third-parties/google";
```

body 태그 내 마지막에 추가 (ChatbotFab 다음):
```tsx
{process.env.NEXT_PUBLIC_GA_ID && (
  <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
)}
```

- [ ] **Step 3: .env.local.example 파일 생성**

`.env.local.example`:
```
# Google Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Google AdSense (추후 설정)
NEXT_PUBLIC_ADSENSE_ID=ca-pub-XXXXXXXXXX
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add app/layout.tsx package.json package-lock.json .env.local.example
git commit -m "feat: add Google Analytics integration and env template"
```

---

## Verification Checklist

Phase 1 완료 후 확인 사항:

1. `npm run dev` → `http://localhost:3000` 접속 가능
2. 모든 섹션이 디자인 목업과 일치 (토스 디자인 토큰 적용)
3. 768px 이하에서 반응형 레이아웃 동작
4. Nav sticky, backdrop blur 적용
5. 챗봇 FAB 우하단 고정
6. `npm run build` 성공
7. Lighthouse Performance 90+ 목표
