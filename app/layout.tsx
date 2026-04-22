import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ChatbotPanel } from "@/components/chatbot-panel";
import { WebSiteSchema, OrganizationSchema } from "@/components/json-ld";
import "./globals.css";

export const metadata: Metadata = {
  title: "정책알리미 — 나에게 맞는 복지·대출 정보",
  description:
    "복지로·소상공인24·금융위원회 데이터를 한곳에. 맞춤 복지·대출 정보를 찾고, 마감 알림을 받아보세요.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://jungcheck.kr"),
  openGraph: {
    title: "정책알리미 — 나에게 맞는 복지·대출 정보",
    description: "복지로·소상공인24·금융위원회 데이터를 한곳에. 맞춤 복지·대출 정보를 찾고, 마감 알림을 받아보세요.",
    siteName: "정책알리미",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "정책알리미",
    description: "나에게 맞는 복지·대출 정보를 한곳에서",
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <WebSiteSchema
          name="정책알리미"
          url={process.env.NEXT_PUBLIC_SITE_URL || "https://jungcheck.kr"}
          description="대한민국 복지 정보와 소상공인 대출·지원금 정보를 한곳에 모아 제공하는 플랫폼"
        />
        <OrganizationSchema
          name="정책알리미"
          url={process.env.NEXT_PUBLIC_SITE_URL || "https://jungcheck.kr"}
          description="공공기관 데이터 기반 복지·대출 정보 안내 서비스"
        />
        <Nav />
        {children}
        <Footer />
        <ChatbotPanel />
        {process.env.NEXT_PUBLIC_ADSENSE_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
        )}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  );
}
