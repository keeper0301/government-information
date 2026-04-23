import type { DisplayProgram } from "@/lib/programs";

export function AlertStrip({ program }: { program: DisplayProgram | null }) {
  if (!program || program.dday === null) return null;

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + program.dday);
  const dateStr = `${endDate.getMonth() + 1}.${endDate.getDate()} 마감`;

  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6">
      <a
        href={`/${program.type}/${program.id}`}
        className="flex items-center border-b border-grey-100 py-[18px] gap-3.5 cursor-pointer hover:opacity-75 transition-opacity no-underline text-inherit"
      >
        {/* 마감임박 배지 — 깊은 와인색 (브랜드 버건디 계열) */}
        <span className="shrink-0 text-xs font-bold text-white bg-blue-700 rounded-[5px] px-2 py-[3px]">
          D-{program.dday}
        </span>
        <span className="flex-1 text-[15px] font-medium text-grey-800 truncate">
          {program.title} 신청이 {program.dday}일 후 마감됩니다
        </span>
        <span className="shrink-0 text-[13px] font-medium text-grey-500">
          {dateStr}
        </span>
      </a>
    </div>
  );
}
