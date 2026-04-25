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

        {/* 주요 페이지 바로가기 4종 */}
        <div className="grid grid-cols-2 gap-3 text-left">
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

        {/* 보조 링크 */}
        <p className="mt-8 text-[13px] text-grey-600">
          문제가 반복된다면{" "}
          <Link href="/help" className="text-blue-500 hover:underline">
            도움말
          </Link>
          에서 자주 묻는 질문을 확인해 주세요.
        </p>
      </div>
    </main>
  );
}
