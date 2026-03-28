import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ChatbotPanel } from "@/components/chatbot-panel";
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
        <ChatbotPanel />
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  );
}
