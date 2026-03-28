# Phase 2: Supabase + 데이터 모델 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase를 연동하고, DB 스키마를 생성하며, 인증 시스템을 구축하고, 시드 데이터를 삽입하여 Phase 3의 핵심 페이지들이 실제 데이터를 사용할 수 있게 한다.

**Architecture:** Supabase JS 클라이언트를 서버/클라이언트 분리하여 구성. DB 테이블 5개(welfare_programs, loan_programs, alarm_subscriptions, blog_posts, user_profiles) 생성. RLS로 읽기는 공개, 쓰기는 인증 필요. Supabase Auth 이메일 로그인 연동.

**Tech Stack:** @supabase/supabase-js, @supabase/ssr, Supabase PostgreSQL, Supabase Auth

**Spec:** `docs/superpowers/specs/2026-03-28-jungcheck-allimi-design.md`

---

## File Structure

```
app/
├── auth/
│   └── callback/route.ts       # OAuth callback handler
├── login/
│   └── page.tsx                # 로그인 페이지
lib/
├── supabase/
│   ├── client.ts               # 브라우저용 Supabase 클라이언트
│   ├── server.ts               # 서버 컴포넌트용 Supabase 클라이언트
│   └── middleware.ts           # 세션 갱신 미들웨어 헬퍼
├── database.types.ts           # Supabase 타입 (수동 정의)
middleware.ts                    # Next.js 미들웨어 (세션 갱신)
supabase/
├── migrations/
│   └── 001_initial_schema.sql  # DB 스키마
└── seed.sql                    # 시드 데이터
```

---

### Task 1: Supabase 패키지 설치 + 클라이언트 설정

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Supabase 패키지 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: .env.local.example 업데이트**

`.env.local.example`에 추가:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: 브라우저용 클라이언트 생성**

`lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: 서버용 클라이언트 생성**

`lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서는 set 불가 — 무시
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: 미들웨어 헬퍼 생성**

`lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return supabaseResponse;
}
```

- [ ] **Step 6: Next.js 미들웨어 생성**

`middleware.ts` (프로젝트 루트):
```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 7: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 8: 커밋**

```bash
git add lib/supabase/ middleware.ts .env.local.example package.json package-lock.json
git commit -m "feat: add Supabase client setup and session middleware"
```

---

### Task 2: DB 타입 정의

**Files:**
- Create: `lib/database.types.ts`

- [ ] **Step 1: 타입 파일 생성**

`lib/database.types.ts`:
```typescript
export type WelfareProgram = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  description: string | null;
  eligibility: string | null;
  benefits: string | null;
  apply_method: string | null;
  apply_url: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
  source_url: string | null;
  region: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type LoanProgram = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  description: string | null;
  eligibility: string | null;
  loan_amount: string | null;
  interest_rate: string | null;
  repayment_period: string | null;
  apply_method: string | null;
  apply_url: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
  source_url: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type AlarmSubscription = {
  id: string;
  user_id: string;
  email: string;
  program_type: "welfare" | "loan";
  program_id: string;
  notify_before_days: number;
  is_active: boolean;
  created_at: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  tags: string[] | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
};

export type UserProfile = {
  id: string;
  age_group: string | null;
  region: string | null;
  occupation: string | null;
  interests: string[] | null;
  created_at: string;
};
```

- [ ] **Step 2: 커밋**

```bash
git add lib/database.types.ts
git commit -m "feat: add database type definitions"
```

---

### Task 3: SQL 마이그레이션 + 시드 데이터

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/seed.sql`

- [ ] **Step 1: 마이그레이션 SQL 생성**

`supabase/migrations/001_initial_schema.sql`:
```sql
-- 복지 프로그램
CREATE TABLE IF NOT EXISTS welfare_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  target TEXT,
  description TEXT,
  eligibility TEXT,
  benefits TEXT,
  apply_method TEXT,
  apply_url TEXT,
  apply_start DATE,
  apply_end DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  region TEXT,
  view_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 소상공인 대출/지원
CREATE TABLE IF NOT EXISTS loan_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  target TEXT,
  description TEXT,
  eligibility TEXT,
  loan_amount TEXT,
  interest_rate TEXT,
  repayment_period TEXT,
  apply_method TEXT,
  apply_url TEXT,
  apply_start DATE,
  apply_end DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  view_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 이메일 알람 구독
CREATE TABLE IF NOT EXISTS alarm_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  program_type TEXT NOT NULL CHECK (program_type IN ('welfare', 'loan')),
  program_id UUID NOT NULL,
  notify_before_days INT DEFAULT 7,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 블로그
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_description TEXT,
  tags TEXT[],
  view_count INT DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 사용자 프로필
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age_group TEXT,
  region TEXT,
  occupation TEXT,
  interests TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE welfare_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarm_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 읽기는 모두 공개
CREATE POLICY "welfare_programs_read" ON welfare_programs FOR SELECT USING (true);
CREATE POLICY "loan_programs_read" ON loan_programs FOR SELECT USING (true);
CREATE POLICY "blog_posts_read" ON blog_posts FOR SELECT USING (true);

-- 알람: 본인 것만
CREATE POLICY "alarm_own_read" ON alarm_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alarm_own_insert" ON alarm_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alarm_own_delete" ON alarm_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 프로필: 본인 것만
CREATE POLICY "profile_own_read" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profile_own_upsert" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profile_own_update" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_welfare_category ON welfare_programs(category);
CREATE INDEX IF NOT EXISTS idx_welfare_region ON welfare_programs(region);
CREATE INDEX IF NOT EXISTS idx_welfare_apply_end ON welfare_programs(apply_end);
CREATE INDEX IF NOT EXISTS idx_loan_category ON loan_programs(category);
CREATE INDEX IF NOT EXISTS idx_loan_apply_end ON loan_programs(apply_end);
CREATE INDEX IF NOT EXISTS idx_alarm_user ON alarm_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(published_at);
```

- [ ] **Step 2: 시드 데이터 생성**

`supabase/seed.sql`:
```sql
INSERT INTO welfare_programs (title, category, target, description, eligibility, benefits, apply_method, apply_url, apply_start, apply_end, source, region) VALUES
('청년 월세 특별지원', '주거', '청년', '월 최대 20만원 · 12개월 지원 · 연소득 5천만원 이하 무주택 청년', '만 19~34세, 연소득 5천만원 이하, 무주택자', '월 최대 20만원, 최장 12개월', '온라인 신청 (복지로)', 'https://www.bokjiro.go.kr', '2026-01-01', '2026-04-04', '복지로', '전국'),
('국민취업지원제도 II유형', '취업', '전체', '구직촉진수당 월 50만원 × 6개월 · 취업활동비용 및 직업훈련 지원', '만 15~69세, 구직자', '구직촉진수당 월 50만원 × 6개월', '온라인 신청 (고용24)', 'https://www.work24.go.kr', NULL, NULL, '고용노동부', '전국'),
('부모급여 (0~1세)', '양육', '부모', '0세 월 100만원, 1세 월 50만원 · 출생신고 후 주민센터 신청', '0~1세 아동의 보호자', '0세 월 100만원, 1세 월 50만원', '주민센터 방문 신청', NULL, NULL, NULL, '보건복지부', '전국'),
('긴급복지 의료지원', '의료', '저소득', '위기상황 시 의료비 최대 300만원 · 입원·수술비 긴급 지원', '기준 중위소득 75% 이하', '의료비 최대 300만원', '주민센터 또는 129 전화', NULL, '2026-01-01', '2026-04-27', '복지로', '전국'),
('청년 내일채움공제', '취업', '청년', '2년간 400만원 납입 시 1,600만원 수령', '만 15~34세, 중소기업 정규직', '2년 만기 시 1,600만원', '워크넷 온라인 신청', 'https://www.work.go.kr', NULL, NULL, '고용노동부', '전국'),
('기초연금', '소득', '노인', '월 최대 334,810원 지급', '만 65세 이상, 소득 하위 70%', '월 최대 334,810원', '주민센터 또는 복지로', 'https://www.bokjiro.go.kr', NULL, NULL, '보건복지부', '전국'),
('서울시 청년수당', '소득', '청년', '월 50만원 × 6개월 활동지원금', '서울 거주 만 19~34세 미취업 청년', '월 50만원 × 6개월', '서울시 홈페이지', 'https://www.seoul.go.kr', '2026-03-01', '2026-05-31', '서울시', '서울'),
('경기도 청년 기본소득', '소득', '청년', '분기별 25만원 지역화폐 지급', '경기도 거주 만 24세', '분기별 25만원', '경기도 홈페이지', 'https://www.gg.go.kr', NULL, NULL, '경기도', '경기');

INSERT INTO loan_programs (title, category, target, description, eligibility, loan_amount, interest_rate, repayment_period, apply_method, apply_url, apply_start, apply_end, source) VALUES
('소상공인 정책자금 (일반경영안정)', '대출', '소상공인', '일반경영안정자금 · 5년 거치 5년 분할상환', '소상공인 확인서 보유 사업자', '최대 1억원', '연 2.0%~3.4%', '5년 거치 5년 분할상환', '소상공인진흥공단 온라인', 'https://ols.semas.or.kr', '2026-01-15', '2026-04-18', '소상공인진흥공단'),
('경영안정자금 특별지원', '지원금', '자영업', '매출 감소 자영업자 대상 · 초저금리 지원', '매출 10% 이상 감소 자영업자', '최대 5천만원', '연 1.5%', '3년 거치 5년 분할상환', '금융위원회 온라인', 'https://www.fsc.go.kr', '2026-02-01', '2026-04-02', '금융위원회'),
('소상공인 신용보증 (창업기업)', '보증', '창업', '업력 7년 이내 창업기업 대상 · 보증료 0.5%', '업력 7년 이내 소상공인', '최대 2억원', '보증료 0.5%', '보증기간 5년', '소상공인24 온라인', 'https://www.sbiz24.kr', NULL, NULL, '소상공인24'),
('전통시장 시설현대화 자금', '대출', '전통시장', '전통시장 내 점포 시설개선 대상', '전통시장 등록 점포 사업자', '최대 7천만원', '연 2.0%', '2년 거치 3년 분할상환', '소상공인진흥공단', 'https://ols.semas.or.kr', '2026-03-01', '2026-04-14', '소상공인진흥공단'),
('청년 창업자금', '대출', '청년창업', '만 39세 이하 청년 창업자 대상', '만 39세 이하, 창업 3년 이내', '최대 1억원', '연 2.0%', '3년 거치 5년 분할상환', '소상공인진흥공단', 'https://ols.semas.or.kr', NULL, NULL, '소상공인진흥공단');

INSERT INTO blog_posts (slug, title, content, meta_description, tags, published_at) VALUES
('2026-youth-welfare-guide', '2026년 청년 복지 총정리: 놓치면 후회할 혜택 모음', '# 2026년 청년이 받을 수 있는 복지 혜택\n\n올해도 다양한 청년 복지 정책이 시행됩니다. 주거, 취업, 소득 지원까지 꼼꼼하게 정리했습니다.\n\n## 1. 주거 지원\n\n### 청년 월세 특별지원\n- 대상: 만 19~34세 무주택 청년\n- 혜택: 월 최대 20만원, 12개월\n- 신청: 복지로 온라인\n\n## 2. 취업 지원\n\n### 국민취업지원제도\n- 대상: 만 15~69세 구직자\n- 혜택: 월 50만원 × 6개월\n\n## 3. 소득 지원\n\n### 서울시 청년수당\n- 대상: 서울 거주 19~34세\n- 혜택: 월 50만원 × 6개월', '2026년 청년이 받을 수 있는 복지 혜택을 주거, 취업, 소득 분야별로 총정리했습니다.', ARRAY['청년', '복지', '2026', '월세', '취업'], '2026-03-01'),
('small-business-loan-2026', '소상공인 대출 비교: 2026년 정책자금 금리·한도 총정리', '# 2026년 소상공인 정책자금 가이드\n\n소상공인이 받을 수 있는 정부 대출을 금리와 한도 기준으로 비교했습니다.\n\n## 1. 일반경영안정자금\n- 한도: 최대 1억원\n- 금리: 연 2.0%~3.4%\n- 상환: 5년 거치 5년 분할\n\n## 2. 경영안정자금 특별지원\n- 한도: 최대 5천만원\n- 금리: 연 1.5%\n\n## 3. 청년 창업자금\n- 한도: 최대 1억원\n- 금리: 연 2.0%', '2026년 소상공인이 받을 수 있는 정부 대출을 금리, 한도, 조건별로 비교합니다.', ARRAY['소상공인', '대출', '정책자금', '금리', '2026'], '2026-03-15');
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/
git commit -m "feat: add database schema migration and seed data"
```

---

### Task 4: 로그인 페이지

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: 로그인 페이지**

`app/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="pt-40 pb-20 px-10 max-w-[400px] mx-auto max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
        로그인
      </h1>
      <p className="text-[15px] text-grey-600 mb-8 leading-[1.6]">
        이메일을 입력하면 로그인 링크를 보내드립니다.
      </p>

      {sent ? (
        <div className="bg-blue-50 rounded-lg p-5 text-[15px] text-blue-600 font-medium leading-[1.6]">
          {email}로 로그인 링크를 보냈습니다.
          <br />
          이메일을 확인해주세요.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
            className="w-full px-4 py-3 border-[1.5px] border-grey-200 rounded-lg text-base text-grey-900 font-pretendard outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(49,130,246,0.12)] placeholder:text-grey-400 mb-3"
          />
          {error && (
            <p className="text-sm text-red mb-3">{error}</p>
          )}
          <button
            type="submit"
            className="w-full py-3 bg-blue-500 text-white border-none rounded-lg text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors"
          >
            로그인 링크 받기
          </button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Auth callback route**

`app/auth/callback/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(origin);
}
```

- [ ] **Step 3: Nav 로그인 버튼에 링크 추가**

`components/nav.tsx`에서 로그인 버튼을 `<a>` 태그로 변경:

기존:
```tsx
<button className="ml-3 px-4 py-[7px] text-sm font-semibold text-blue-500 bg-blue-50 border-none rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
  로그인
</button>
```

변경:
```tsx
<a
  href="/login"
  className="ml-3 px-4 py-[7px] text-sm font-semibold text-blue-500 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors no-underline"
>
  로그인
</a>
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 5: 커밋**

```bash
git add app/login/ app/auth/ components/nav.tsx
git commit -m "feat: add login page and auth callback"
```

---

## Verification

Phase 2 완료 후 확인:
1. `npm run build` 성공
2. `/login` 페이지 렌더링 확인
3. `supabase/migrations/001_initial_schema.sql`을 Supabase 대시보드 SQL 에디터에 붙여넣어 실행 가능
4. `supabase/seed.sql`로 테스트 데이터 삽입 가능
5. 타입 정의가 스키마와 일치
