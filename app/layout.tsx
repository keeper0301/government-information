import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AdsenseLazyLoader } from "@/components/adsense-lazy-loader";
import { ReconsentBannerContainer } from "@/components/reconsent-banner-container";
import { AuthEventTracker } from "@/components/auth-event-tracker";
import { PWARegister } from "@/components/pwa-register";
import { WebSiteSchema, OrganizationSchema } from "@/components/json-ld";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import "./globals.css";

// ChatbotPanel — 우측 하단 floating 위젯, 즉시 노출 불필요.
// next/dynamic 으로 별도 청크 분리 → 메인 번들 가벼움 → TBT 감축.
// SSR 유지 (loading: () => null) — SEO 영향 없음, 첫 paint 비차단.
const ChatbotPanel = dynamic(
  () => import("@/components/chatbot-panel").then((m) => ({ default: m.ChatbotPanel })),
  { loading: () => null },
);
// 폰트는 Pretendard Variable 단일 (globals.css 의 CDN import).
// 2026-04-25 친근한 핀테크 톤 리뉴얼로 Editorial(Bodoni·EB Garamond·
// Nanum Myeongjo) 폰트군은 폐기. 토스 TDS 처럼 단일 sans 가 일관됨.

export const metadata: Metadata = {
  title: "keepioo · 정책알리미 — 한국의 공공 지원제도 큐레이션",
  description:
    "보조금24·복지로·기업마당·온통청년 데이터를 한곳에. 내 조건에 맞는 새 정부·지자체 정책을 이메일·알림톡으로 받아보세요.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"),
  applicationName: "keepioo",
  authors: [{ name: "keepioo" }],
  openGraph: {
    // url 명시 — metadataBase 만으로는 일부 크롤러가 og:url 을 인식 못 함.
    // 카카오톡·페이스북 공유 시 정식 canonical 표기 안정성 ↑.
    url: "/",
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

// 테마 컬러 — 토스 grey900 (모바일 브라우저 상단 색)
export const viewport = {
  themeColor: "#191F28",
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

  // 헤더 종 아이콘 배지에 표시할 활성 알림 개수.
  // 비로그인은 0 (Nav 안 NotificationBell 이 비노출 처리).
  let alarmCount = 0;
  if (user) {
    const { count } = await supabase
      .from("alarm_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true);
    alarmCount = count ?? 0;
  }

  return (
    <html lang="ko">
      <head>
        {/* Pretendard 폰트 preload — globals.css @import 제거 후 직접 link.
            @import 는 CSS parser 차단이라 폰트 다운로드 시작이 늦어짐.
            React Server Component 에서 문자열 onLoad 를 주입하지 않고,
            preload + stylesheet 조합으로 런타임 오류 없이 빠르게 적용. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="preload"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          />
        </noscript>
      </head>
      <body>
        {/* AdSense 라이브러리 — 사용자 첫 상호작용 (scroll·touch·mouse·key)
            또는 10초 후 lazy 로드. lighthouse 측정 윈도우 (~5초) 밖에서
            로드되어 TBT 점수 깎임 회피. components/adsense-lazy-loader.tsx 참조. */}
        <AdsenseLazyLoader />
        <WebSiteSchema
          name="정책알리미"
          url={process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}
          description="대한민국 복지 정보와 소상공인 대출·지원금 정보를 한곳에 모아 제공하는 플랫폼"
        />
        <OrganizationSchema
          name="정책알리미"
          url={process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com"}
          description="공공기관 데이터 기반 복지·대출 정보 안내 서비스"
          legalName="키피오"
          ceoName="최관철"
          taxId="657-24-02265"
          email="keeper0301@gmail.com"
        />
        <Nav isAdmin={isAdmin} loggedIn={!!user} alarmCount={alarmCount} />
        <ReconsentBannerContainer />
        {children}
        <Footer />
        <ChatbotPanel />
        {/* PWA service worker 등록 — offline 캐싱 + 향후 push 알림 listener.
            client only, 시각 출력 없음, dev 모드(localhost)는 자동 skip. */}
        <PWARegister />
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
