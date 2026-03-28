# 정책알리미 — 디자인 스펙

## Context
복지 정보와 소상공인 대출 정보를 한곳에 모아 사용자가 쉽게 자기에게 맞는 혜택을 찾을 수 있는 웹 플랫폼. AdSense로 수익화하며, SEO 최적화로 트래픽을 극대화한다.

## 사이트명 & 로고
- **이름**: 정책알리미
- **로고**: 블루 그라데이션(#3182f6→#1b64da) 스쿼클(border-radius 8px) + 화이트 벨 SVG 마크 + "정책알리미" 워드마크(Pretendard 800)
- **앱 아이콘**: 30×30 ~ 44×44px 스쿼클, 다크/라이트/파비콘 대응

## 기술 스택
- **프레임워크**: Next.js 14+ (App Router, SSG/ISR)
- **스타일링**: Tailwind CSS + 토스 디자인 시스템 커스텀 토큰
- **폰트**: Pretendard Variable (CDN)
- **DB/인증**: Supabase (PostgreSQL + Auth)
- **데이터 수집**: Supabase Edge Functions + pg_cron + pg_net (6시간 주기)
- **이메일 알림**: Resend (React Email 템플릿, scheduled_at 예약발송)
- **배포**: Vercel
- **광고**: Google AdSense (@next/third-parties 패턴)
- **분석**: Google Analytics (@next/third-parties/google)

## 데이터 소스
1. **공공데이터포털 (data.go.kr)** — 복지서비스 API, 소상공인 지원사업 API
2. **복지로 (bokjiro.go.kr)** — 복지 프로그램
3. **소상공인24 (sbiz24.kr)** — 소상공인 지원
4. **소상공인시장진흥공단 (semas.or.kr)** — 정책자금, 보증
5. **금융위원회 (fsc.go.kr)** — 금융상품 정보
6. **지자체 웹사이트** — API 없는 경우 선택적 크롤링

## 디자인 시스템 토큰 (토스 기반)

### 색상
- Primary: `#3182f6` (토스 블루)
- Blue scale: `#e8f3ff` ~ `#194aa6`
- Semantic: Red `#f04452`, Orange `#fe9800`, Green `#03b26c`
- Grey scale: `#f9fafb`(g50) ~ `#191f28`(g900) — 7단계

### 타이포그래피
- Font: Pretendard Variable
- Hero: 48px / 700 / -1.8px tracking / 1.3 line-height
- Section title: 22px / 700 / -0.6px
- Body: 16px / 600 / -0.3px
- Desc: 14px / 400 / 1.45 line-height
- Small: 12-13px / 500

### 간격
- Nav height: 58px
- Hero padding: 160px top, 100px bottom
- Section padding: 80px vertical
- Max width: 1140px
- Side padding: 40px (desktop), 24px (mobile)

### 레이디우스
- sm: 6px, md: 10px, lg: 14px, xl: 20px

### 컴포넌트
- **Nav**: sticky, blur backdrop, hairline border
- **ListRow**: squircle SVG 아이콘(40×40, g100 배경) + title/desc + amount/source
- **D-day labels**: red(urgent), blue(normal), grey(상시)
- **Search**: border 1.5px, radius 14px, blue focus ring
- **Tags**: pill shape(radius 100px), g50 bg, g100 border
- **Features**: 3-column grid, 1px gap border, 01/02/03 numbering
- **Ad slots**: hairline border top/bottom only
- **FAB chatbot**: g900 circle, 54×54

### 애니메이션
- Transition: cubic-bezier(0.33, 1, 0.68, 1)
- Scroll reveal: IntersectionObserver, translateY(20px) → 0, opacity 0 → 1
- Stagger delay: 0.06s increments
- Hover: translateY(-2px~-3px), blue border on cards

## 페이지 구성

### / (홈)
- 히어로: 검색 중심 + 인기 태그
- 마감임박 배너 (D-day)
- 복지 정보 리스트 (ListRow × 4)
- AdSense 영역
- 대출 정보 리스트 (ListRow × 3)
- 달력 프리뷰 (월간, 마감일 dot 표시)
- 기능 안내 (01/02/03)
- 푸터

### /welfare — 복지 정보 목록 (필터: 카테고리, 지역, 대상)
### /welfare/[id] — 복지 상세 (ISR revalidate=3600)
### /loan — 대출 목록 (필터: 카테고리, 대상)
### /loan/[id] — 대출 상세 (ISR revalidate=3600)
### /calendar — 신청기한 달력 (월간 뷰 + 리스트 뷰)
### /chatbot — 규칙 기반 키워드 매칭 챗봇
### /blog/[slug] — SEO 블로그 (SSG)

## 데이터베이스 스키마 (Supabase PostgreSQL)

### welfare_programs
id, title, category, target, description, eligibility, benefits, apply_method, apply_url, apply_start, apply_end, source, source_url, region, view_count, created_at, updated_at

### loan_programs
id, title, category, target, description, eligibility, loan_amount, interest_rate, repayment_period, apply_method, apply_url, apply_start, apply_end, source, source_url, view_count, created_at, updated_at

### alarm_subscriptions
id, user_id, email, program_type(welfare|loan), program_id, notify_before_days(default 7), is_active, created_at

### blog_posts
id, slug, title, content, meta_description, tags[], view_count, published_at, created_at

### user_profiles
id(→auth.users), age_group, region, occupation, interests[], created_at

## 알림 시스템
- Supabase pg_cron → Edge Function (매일 9시)
- 마감 N일 전 구독자에게 Resend 이메일 발송
- React Email 한글 템플릿

## 챗봇
- 규칙 기반 키워드/필터 매칭
- 프론트엔드 채팅 UI (플로팅 FAB)
- DB 검색 → 관련 프로그램 카드 추천

## SEO 전략
- SSG/ISR로 검색엔진 최적화
- 블로그 콘텐츠 ("2026년 청년 복지 총정리" 등)
- OG 태그 + 카카오/네이버 공유 최적화
- sitemap.xml / robots.txt 자동 생성

## AdSense 배치
- 홈: 복지/대출 섹션 사이 1개
- 상세 페이지: 본문 하단 1개
- 블로그: 본문 중간 + 하단

## 검증 방법
1. `npm run dev`로 로컬 실행 후 전 페이지 접근 확인
2. Lighthouse SEO/Performance 점수 확인
3. 모바일 반응형 테스트 (768px 이하)
4. Supabase 데이터 CRUD 확인
5. 이메일 알림 발송 테스트 (Resend)
6. 챗봇 키워드 응답 테스트

## 목업 참조
- 홈페이지: `.superpowers/brainstorm/1198-1774664888/content/toss-homepage-v5.html`
- 로고 시안: `.superpowers/brainstorm/1198-1774664888/content/logo-jungcheck-v2.html` (#04 확정)
