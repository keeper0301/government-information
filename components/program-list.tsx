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
      <div className="flex items-baseline justify-between mb-8">
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
      <div className="flex flex-col">
        {programs.map((p) => (
          <ProgramRow key={p.id} program={p} />
        ))}
      </div>
    </div>
  );
}
