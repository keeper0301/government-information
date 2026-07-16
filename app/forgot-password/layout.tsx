import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "비밀번호 재설정 — 정책알리미",
  description: "정책알리미 계정의 비밀번호 재설정 링크를 이메일로 받습니다.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/forgot-password" },
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
