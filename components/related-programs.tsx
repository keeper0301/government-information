import { ProgramRow } from "./program-row";
import type { DisplayProgram } from "@/lib/programs";

export function RelatedPrograms({ programs }: { programs: DisplayProgram[] }) {
  if (programs.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-grey-100">
      <h2 className="text-lg font-bold text-grey-900 mb-4">
        비슷한 프로그램
      </h2>
      <div>
        {programs.map((p) => (
          <ProgramRow key={p.id} program={p} />
        ))}
      </div>
    </section>
  );
}
