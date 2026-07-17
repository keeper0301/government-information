import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "AI 정책 상담 — 정책알리미",
  description: "복지·대출·지원금 질문을 입력하면 관련 정책과 신청 전 확인할 조건을 안내합니다.",
  alternates: { canonical: "/consult" },
};

export default function ConsultLayout({ children }: { children: ReactNode }) {
  return children;
}
