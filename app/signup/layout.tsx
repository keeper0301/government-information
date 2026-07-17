import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "회원가입 — 정책알리미",
  description: "정책알리미에 가입하고 내 조건에 맞는 복지·대출 정책 알림을 받아보세요.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
