import type { DisplayProgram } from "@/lib/programs";

type Props = {
  programs: DisplayProgram[];
  isLoggedIn?: boolean;
};

// 마감 임박 다건 나열 (기존 1건 표시 → 정보 밀도 ↑)
// - 데스크톱: 좌측 라벨 + 3건 가로 나열 + 우측 CTA
// - 모바일: 가로 스크롤 (overflow-x-auto)
// - 비로그인: CTA "내 조건 찾기" (/recommend)
// - 로그인: CTA "모두 보기" (/calendar)
export function AlertStrip({ programs, isLoggedIn = false }: Props) {
  const visible = programs.filter((p) => p.dday !== null).slice(0, 3);
  if (visible.length === 0) return null;

  const ctaHref = isLoggedIn ? "/calendar" : "/recommend";
  const ctaLabel = isLoggedIn ? "모두 보기" : "내 조건으로 찾기";

  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6">
      <div className="flex items-center gap-4 border-b border-grey-100 py-[14px] max-md:py-3 max-md:gap-2">
        {/* 좌측 라벨 — 데스크톱에서만 */}
        <div className="shrink-0 flex items-center gap-1.5 text-[13px] font-bold text-grey-900 max-md:hidden">
          <span aria-hidden="true">⏰</span>
          <span>마감 임박</span>
        </div>
        {/* 모바일 compact 라벨 */}
        <div className="shrink-0 hidden max-md:flex items-center gap-1 text-[12px] font-bold text-grey-900">
          <span aria-hidden="true">⏰</span>
        </div>

        {/* 정책 카드 가로 나열 (모바일 스크롤) */}
        <div className="flex-1 min-w-0 flex items-center gap-4 overflow-x-auto max-md:gap-3 scrollbar-none">
          {visible.map((p) => (
            <a
              key={p.id}
              href={`/${p.type}/${p.id}`}
              className="shrink-0 flex items-center gap-2 no-underline text-inherit hover:opacity-75 transition-opacity"
            >
              {/* ProgramRow DdayLabel 과 동일 스타일 — 전체 사이트 D-N 배지 일관성 */}
              <span
                className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                  (p.dday ?? 99) <= 7
                    ? "bg-[#FFEEEE] text-red"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                D-{p.dday}
              </span>
              <span className="text-[14px] font-medium text-grey-900 truncate max-w-[260px] max-md:max-w-[200px]">
                {p.title}
              </span>
            </a>
          ))}
        </div>

        {/* 우측 CTA */}
        <a
          href={ctaHref}
          className="shrink-0 text-[13px] font-semibold text-blue-700 no-underline hover:text-blue-800 transition-colors whitespace-nowrap"
        >
          {ctaLabel} →
        </a>
      </div>
    </div>
  );
}
