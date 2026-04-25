import { ProgramRow } from "./program-row";
import type { DisplayProgram } from "@/lib/programs";

type Props = {
  title: string;
  programs: DisplayProgram[];
  moreHref: string;
};

export function ProgramList({ title, programs, moreHref }: Props) {
  return (
    <div>
      {/* 제목·전체보기 는 카드 밖 상단 — feature-grid 의 '이렇게 도와드려요'
          섹션 제목과 같은 위계 (h2) */}
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          {title}
        </h2>
        <a
          href={moreHref}
          className="text-sm font-semibold text-grey-800 no-underline hover:text-blue-500 transition-colors py-2 min-h-[44px] flex items-center"
        >
          전체보기
        </a>
      </div>
      {/* 목록 본체를 흰 카드로 감싸 크림 배경 대비 가독성 ↑.
          feature-grid 와 동일한 border + rounded 로 디자인 통일감. */}
      <div className="flex flex-col bg-white border border-grey-100 rounded-3xl px-6 md:px-8 py-2 shadow-md">
        {programs.map((p) => (
          <ProgramRow key={p.id} program={p} />
        ))}
      </div>
    </div>
  );
}
