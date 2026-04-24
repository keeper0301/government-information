import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ChatbotPanel } from "@/components/chatbot-panel";
import { ReconsentBannerContainer } from "@/components/reconsent-banner-container";
import { AuthEventTracker } from "@/components/auth-event-tracker";
import { WebSiteSchema, OrganizationSchema } from "@/components/json-ld";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "keepioo · 정책알리미 — 한국의 공공 지원제도 큐레이션",
  description:
    "보조금24·복지로·기업마당·온통청년 데이터를 한곳에. 내 조건에 맞는 새 정부·지자체 정책을 이메일·알림톡으로 받아보세요.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"),
  applicationName: "keepioo",
  authors: [{ name: "keepioo" }],
  openGraph: {
    title: "keepioo · 정책알리미",
    description:
      "한국의 공공 지원제도를 큐레이션해 이메일·알림톡으로 전달합니다.",
    siteName: "keepioo",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "keepioo · 정책알리미",
    description: "한국의 공공 지원제도를 큐레이션합니다.",
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  // 검색엔진 소유권 확인 토큰 — Vercel 환경변수에 값만 넣으면 자동 주입.
  // 사용 방법:
  //   1) Google Search Console 등록 → 메타 태그 방식 선택 → content 값 복사
  //      → Vercel env GOOGLE_SITE_VERIFICATION 에 저장 → 재배포 → 확인 버튼.
  //   2) Naver Search Advisor 에서 메타 태그 받아 NAVER_SITE_VERIFICATION 에 저장.
  //   3) 기타 (Bing 등) 도 필요시 other 에 추가.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: {
      ...(process.env.NAVER_SITE_VERIFICATION && {
        "naver-site-verification": process.env.NAVER_SITE_VERIFICATION,
      }),
    },
  },
  // Next.js 16: app/icon.svg / apple-icon.svg / manifest.ts 는 자동 감지.
};

// 테마 컬러 (브랜드 ink black) — 새 viewport export 경로
export const viewport = {
  themeColor: "#0E0B08",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 어드민 메뉴 노출 여부 — 서버에서 한 번 판정해 Nav 로 내려보냄.
  // isAdmin 은 UI 노출용일 뿐, 실제 권한은 /admin 페이지에서 서버 가드로 재검증함.
  // (클라이언트에서 isAdmin 을 조작해도 admin 페이지 진입 불가 — lib/admin-auth.ts)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminUser(user?.email);

  return (
    <html lang="ko">
      <head>
        {/* AdSense 코드 — head 에 raw script 로 박아야 크롤러가 인식 */}
        {process.env.NEXT_PUBLIC_ADSENSE_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
            crossOrigin="anonymous"
          />
        )}
        {/* 브랜드 폰트 (Editorial Masthead 로고·헤더 전용) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,700;1,400;1,700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Nanum+Myeongjo:wght@400;700;800&display=swap"
        />
      </head>
      <body>
        <WebSiteSchema
          name="정책알리미"
          url={process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}
          description="대한민국 복지 정보와 소상공인 대출·지원금 정보를 한곳에 모아 제공하는 플랫폼"
        />
        <OrganizationSchema
          name="정책알리미"
          url={process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}
          description="공공기관 데이터 기반 복지·대출 정보 안내 서비스"
        />
        <Nav isAdmin={isAdmin} />
        <ReconsentBannerContainer />
        {children}
        <Footer />
        <ChatbotPanel />
        {/* OAuth/매직링크 callback 의 ?auth_event 쿼리를 GA4 로 전송.
            useSearchParams 사용하므로 Suspense 경계로 감싸 정적 렌더 영향 방지. */}
        <Suspense fallback={null}>
          <AuthEventTracker />
        </Suspense>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  );
}
