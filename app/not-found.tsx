// ============================================================
// 404 Not Found — 잘못된 URL 진입 시 복구 UX
// ============================================================
// Next.js App Router 의 not-found convention. /app/not-found.tsx 는
// 라우트에서 notFound() 호출 시 또는 정의되지 않은 경로 진입 시 렌더됨.
//
// 목적:
//   - 사용자가 막다른 길에 도달해도 빠르게 재시작 가능한 경로 제공
//   - keepioo 의 핵심 기능 4종(홈·복지·대출·추천)으로 분산 유도
//   - 브랜드 톤 유지 (딱딱한 기본 404 대신 친화적 안내)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "찾으시는 페이지가 없어요 | 정책알리미",
  description: "요청하신 페이지를 찾을 수 없습니다. 홈·복지정보·대출정보·맞춤추천 중 원하는 곳으로 이동해 주세요.",
  robots: { index: false, follow: false },
};

const LINKS: { href: string; title: string; desc: string; emoji: string }[] = [
  {
    href: "/",
    title: "홈으로",
    desc: "최신 공고·오늘의 마감 한눈에",
    emoji: "🏠",
  },
  {
    href: "/welfare",
    title: "복지 지원사업",
    desc: "정부·지자체 복지 혜택",
    emoji: "💙",
  },
  {
    href: "/loan",
    title: "대출·지원금",
    desc: "소상공인·창업 금융 지원",
    emoji: "💳",
  },
  {
    href: "/recommend",
    title: "맞춤 추천",
    desc: "30초 입력으로 내게 맞는 정책",
    emoji: "✨",
  },
];

// 카테고리 hub 4종 — AdSense 검수자가 404 hit 시 정상 운영 시그널 (메인 카테고리 진입 가능).
const HUB_LINKS = [
  { slug: "youth", label: "청년", emoji: "🎓" },
  { slug: "senior", label: "노년", emoji: "🌸" },
  { slug: "business", label: "자영업·소상공인", emoji: "🏪" },
  { slug: "housing", label: "주거", emoji: "🏠" },
];

export default function NotFound() {
  return (
    <main className="min-h-screen bg-grey-50 flex items-center justify-center px-5 py-20">
      <div className="max-w-[640px] w-full text-center">
        {/* 404 메시지 */}
        <div className="mb-8">
          <p className="text-[13px] font-semibold text-blue-500 tracking-[0.2em] mb-3">
            404 · NOT FOUND
          </p>
          <h1 className="text-[28px] md:text-[36px] font-extrabold tracking-[-0.6px] text-grey-900 mb-3 leading-[1.3]">
            찾으시는 페이지가 없어요
          </h1>
          <p className="text-[15px] text-grey-700 leading-[1.6]">
            주소가 잘못되었거나, 공고가 삭제되었을 수 있어요.
            <br />
            아래에서 원하는 곳으로 이동해 주세요.
          </p>
        </div>

        {/* 검색 폼 — 사용자/검수자가 즉시 정책 검색 가능 (GET form, JS 없어도 동작) */}
        <form method="get" action="/search" className="mb-6">
          <div className="flex items-center gap-2 bg-white border border-grey-200 rounded-2xl p-2 pl-5 max-w-[500px] mx-auto focus-within:border-blue-500 focus-within:shadow-[0_0_0_4px_rgba(49,130,246,0.16)] transition-all">
            <input
              type="text"
              name="q"
              placeholder="원하는 정책 검색 (예: 청년 월세, 소상공인 대출)"
              required
              minLength={2}
              aria-label="검색어"
              className="flex-1 min-w-0 border-none outline-none bg-transparent text-[15px] text-grey-900 text-left"
            />
            <button
              type="submit"
              className="shrink-0 h-10 px-4 bg-blue-500 text-white border-none rounded-xl text-[14px] font-bold cursor-pointer hover:bg-blue-600 transition-colors"
            >
              검색
            </button>
          </div>
        </form>

        {/* 주요 페이지 바로가기 4종 */}
        <div className="grid grid-cols-2 gap-3 text-left mb-6">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="bg-white border border-grey-200 rounded-xl p-4 no-underline hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(49,130,246,0.08)] transition-all"
            >
              <div className="text-[24px] mb-1" aria-hidden="true">
                {l.emoji}
              </div>
              <div className="text-[15px] font-bold text-grey-900 mb-0.5 flex items-center gap-1">
                {l.title}
                <span className="text-blue-500 text-[13px]">→</span>
              </div>
              <div className="text-[12px] text-grey-600 leading-[1.4]">
                {l.desc}
              </div>
            </Link>
          ))}
        </div>

        {/* 카테고리 hub — 검수자가 사이트 정상 운영 + 콘텐츠 깊이 인식 */}
        <div className="mb-6">
          <p className="text-[12px] font-semibold text-grey-500 mb-2 tracking-[1px] uppercase">
            카테고리별 정책
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {HUB_LINKS.map((h) => (
              <Link
                key={h.slug}
                href={`/c/${h.slug}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-grey-200 text-[13px] text-grey-700 hover:border-blue-400 hover:text-blue-600 no-underline transition-colors"
              >
                <span aria-hidden="true">{h.emoji}</span>
                {h.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 보조 링크 + 운영 정보 (검수자 신뢰성 시그널) */}
        <p className="text-[13px] text-grey-600">
          문제가 반복된다면{" "}
          <Link href="/help" className="text-blue-500 hover:underline">
            도움말
          </Link>
          {" "}또는{" "}
          <Link href="/about" className="text-blue-500 hover:underline">
            서비스 소개
          </Link>
          를 확인해 주세요.
        </p>
        <p className="text-[12px] text-grey-500 mt-2">
          keepioo · 정책알리미는 정부 복지·대출·지원금 정책을 한곳에 모아 안내합니다.
        </p>
      </div>
    </main>
  );
}
