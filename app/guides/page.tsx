// ============================================================
// /guides — 정책 종합 가이드 목록
// ============================================================
// 마케팅 시스템(keepio_agent) 이 격주 발행한 정책 바이블 5글 묶음 자산화.
// 발행순(최신 우선) 카드 리스트.
// ISR 60초 — 사장님이 supabase Dashboard 에서 다듬은 후 1분 안에 반영.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getGuides } from "@/lib/policy-guides";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "정책 종합 가이드 | 정책알리미",
  description:
    "소상공인·자영업자 사장님을 위한 정책 종합 가이드. 자격·서류·신청·함정·마감까지 한 번에. 격주 새 정책 추가.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "정책 종합 가이드 | 정책알리미",
    description: "소상공인 정책 자격·서류·신청까지 종합 정리",
    type: "website",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function preview(text: string, maxLen = 100): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "...";
}

export default async function GuidesPage() {
  const guides = await getGuides(50);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">정책 종합 가이드</h1>
        <p className="text-gray-600">
          소상공인·자영업자 사장님을 위한 정책 종합 정리. 자격·서류·신청·함정까지 한 번에.
        </p>
      </header>

      {guides.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">
          아직 발행된 가이드가 없어요. 격주 수요일에 새 가이드가 올라옵니다.
        </p>
      ) : (
        <ul className="space-y-4">
          {guides.map((guide) => (
            <li key={guide.id}>
              <Link
                href={`/guides/${guide.slug}`}
                className="block border rounded-lg p-5 hover:border-gray-400 transition-colors"
              >
                <div className="text-sm text-gray-500 mb-1">
                  {formatDate(guide.publishedAt)} · 5편 시리즈
                </div>
                <h2 className="text-xl font-semibold mb-2">{guide.title}</h2>
                <p className="text-gray-700 leading-relaxed">
                  {preview(guide.posts[0] ?? "")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
