import { ProgramRow } from "./program-row";
import type { DisplayProgram } from "@/lib/programs";

type Props = {
  programs: DisplayProgram[];
  // 섹션 제목 — 기본 "비슷한 프로그램". 뉴스 상세 등에선 다른 카피로 오버라이드.
  title?: string;
  // 제목 밑 보조 문구 — 선택. 왜 이 공고들이 관련 있는지 설명 용도.
  hint?: string;
};

export function RelatedPrograms({
  programs,
  title = "비슷한 프로그램",
  hint,
}: Props) {
  if (programs.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-grey-100">
      <h2 className="text-lg font-bold text-grey-900 mb-1">{title}</h2>
      {hint && (
        <p className="text-[13px] text-grey-600 mb-4 leading-[1.55]">{hint}</p>
      )}
      <div className={hint ? "" : "mt-4"}>
        {programs.map((p) => (
          <ProgramRow key={p.id} program={p} />
        ))}
      </div>
    </section>
  );
}
