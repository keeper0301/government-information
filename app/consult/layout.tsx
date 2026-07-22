import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "AI 정책 상담 — 정책알리미",
  description: "복지·대출·지원금 질문을 입력하면 관련 정책과 신청 전 확인할 조건을 안내합니다.",
  alternates: { canonical: "/consult" },
  // 입력형 상담 도구는 사용자 행동 목적 화면입니다. AdSense 재심사에서는
  // 충분한 본문을 가진 가이드·정책 허브 중심으로 평가되도록 색인 제외합니다.
  robots: { index: false, follow: true },
};

export default function ConsultLayout({ children }: { children: ReactNode }) {
  return children;
}
