import type { Metadata } from "next";
import { RecommendForm } from "./form";

export const metadata: Metadata = {
  title: "맞춤추천 — 정책알리미",
  description: "나이, 지역, 직업에 맞는 복지·대출 정책을 추천받으세요.",
};

export default function RecommendPage() {
  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 페이지 제목 */}
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        맞춤추천
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        나의 조건에 맞는 정책을 찾아드립니다
      </p>

      {/* 추천 폼 + 결과 (클라이언트 컴포넌트) */}
      <RecommendForm />
    </main>
  );
}
