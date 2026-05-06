// ============================================================
// /guides — 정책 종합 가이드 목록
// ============================================================
// 마케팅 시스템(keepio_agent) 이 격주 발행한 정책 바이블 5글 묶음 자산화.
// 발행순(최신 우선) 카드 리스트.
// ISR 60초 — 사장님이 supabase Dashboard 에서 다듬은 후 1분 안에 반영.
//
// 2026-05-06: policy_guides 0건 (외부 시스템 발행 대기 중) 빈 상태에서
// AdSense 검수자에게 부정 신호. 빈 상태 fallback 강화 — 4 cohort hub +
// 7 블로그 카테고리 노출로 의미 있는 정책 hub 페이지 유지.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getGuides } from "@/lib/policy-guides";
import { CATEGORY_HUBS, CATEGORY_SLUGS } from "@/lib/category-hubs";
import { BLOG_CATEGORIES } from "@/lib/blog-categories";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "정책 종합 가이드 | 정책알리미",
  description:
    "정부·지자체 복지·대출·지원금 정책 종합 가이드. 청년·노년·자영업·주거 카테고리별 자격·신청·마감 정리. 매일 새 글 발행.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "정책 종합 가이드 | 정책알리미",
    description: "복지·대출·지원금 정책 자격·신청까지 종합 정리",
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
          정부·지자체 복지·대출·지원금 정책을 카테고리별로 정리했어요. 자격·서류·신청·함정·마감까지 한 번에.
        </p>
      </header>

      {/* 정책 가이드 카드 list (있으면 위에 노출) */}
      {guides.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">최근 발행 가이드</h2>
          <ul className="space-y-4">
            {guides.map((guide) => (
              <li key={guide.id}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="block border rounded-lg p-5 hover:border-gray-400 transition-colors no-underline"
                >
                  <div className="text-sm text-gray-500 mb-1">
                    {formatDate(guide.publishedAt)} · 5편 시리즈
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-grey-900">{guide.title}</h3>
                  <p className="text-gray-700 leading-relaxed">
                    {preview(guide.posts[0] ?? "")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 사용자 그룹별 hub — 4 cohort wedge */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-3">사용자 그룹별 정책</h2>
        <p className="text-sm text-gray-600 mb-4">
          나에게 맞는 정책을 카테고리에서 빠르게 찾아보세요. 각 hub 에 추천 정책·마감 임박·자주 묻는 질문까지 정리되어 있어요.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CATEGORY_SLUGS.map((slug) => {
            const hub = CATEGORY_HUBS[slug];
            return (
              <Link
                key={slug}
                href={`/c/${slug}`}
                className="flex items-start gap-3 border rounded-lg p-4 hover:border-emerald-400 transition-colors no-underline"
              >
                <span className="text-[28px] leading-none mt-1" aria-hidden="true">
                  {hub.emoji}
                </span>
                <div>
                  <div className="text-base font-semibold text-grey-900">
                    {hub.label}
                  </div>
                  <div className="text-sm text-gray-600 leading-snug mt-0.5">
                    {hub.hero}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 블로그 카테고리 chip — 7 카테고리 매일 자동 발행 */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-3">블로그 카테고리</h2>
        <p className="text-sm text-gray-600 mb-4">
          매일 새 정책 가이드가 자동 발행됩니다. 카테고리별로 모아 보세요.
        </p>
        <div className="flex flex-wrap gap-2">
          {BLOG_CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/blog/category/${encodeURIComponent(cat)}`}
              className="px-4 py-2 rounded-full bg-white border text-sm text-grey-700 hover:border-blue-400 hover:text-blue-600 no-underline transition-colors"
            >
              {cat}
            </Link>
          ))}
        </div>
      </section>

      {/* CTA — 빈 페이지 방지 + 가입 유도 */}
      <section className="border-t pt-8">
        <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 p-6">
          <h2 className="text-lg font-bold text-grey-900 mb-2">
            내 조건에 맞는 정책만 골라 보세요
          </h2>
          <p className="text-sm text-grey-700 leading-relaxed mb-4">
            나이·지역·직업·소득을 기반으로 자동 추천 + 마감 임박 정책 이메일 알림. 가입은 무료입니다.
          </p>
          <Link
            href="/quiz"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm no-underline"
          >
            1분 진단부터 시작 →
          </Link>
        </div>
      </section>
    </main>
  );
}
