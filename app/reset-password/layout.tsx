import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "새 비밀번호 설정 — 정책알리미",
  description: "정책알리미 계정의 새 비밀번호를 설정합니다.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/reset-password" },
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
