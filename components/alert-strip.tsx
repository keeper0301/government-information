import type { DisplayProgram } from "@/lib/programs";

type Props = {
  programs: DisplayProgram[];
  isLoggedIn?: boolean;
};

// 마감 임박 공고 자동 마퀴 (가로 무한 루프)
// - 데스크톱/모바일 공통: 좌측 라벨 + 중앙 마퀴 + 우측 CTA
// - 원본 리스트를 2회 렌더링해서 translateX(-50%) 로 끊김 없이 반복
// - 마우스 hover / 포커스 시 자동 정지 (클릭 편의)
// - 아이템이 3개 미만이면 마퀴 대신 정적 표시 (복제로 인한 공백 방지)
// - 비로그인: CTA "내 조건으로 찾기" / 로그인: "모두 보기"
export function AlertStrip({ programs, isLoggedIn = false }: Props) {
  // dday 가 숫자로 나온 항목만 (마감일 불명 제외)
  const visible = programs.filter((p) => p.dday !== null);
  if (visible.length === 0) return null;

  const ctaHref = isLoggedIn ? "/calendar" : "/recommend";
  const ctaLabel = isLoggedIn ? "모두 보기" : "내 조건으로 찾기";

  // 아이템이 충분히 많을 때만 자동 흐름 (최소 3개 미만은 그냥 보여줌)
  const shouldAnimate = visible.length >= 3;
  // 카드 하나당 약 4초 속도 (최소 20초 보장) — 너무 빠르면 읽기 어려움
  const durationSec = Math.max(visible.length * 4, 20);

  // 각 공고를 하나의 카드로 렌더링 (원본용/복제본용에서 재사용)
  const renderCard = (p: DisplayProgram, idx: number, isClone = false) => (
    <a
      key={`${isClone ? "clone" : "orig"}-${p.id}-${idx}`}
      href={`/${p.type}/${p.id}`}
      aria-hidden={isClone ? true : undefined}
      tabIndex={isClone ? -1 : undefined}
      className="shrink-0 flex items-center gap-2 no-underline text-inherit hover:opacity-75 transition-opacity"
    >
      {/* D-N 배지 — 사이트 전역 DdayLabel 과 동일 톤 */}
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
  );

  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6">
      <div className="flex items-center gap-4 border-b border-grey-100 py-[14px] max-md:py-3 max-md:gap-2">
        {/* 좌측 라벨 — 데스크톱 */}
        <div className="shrink-0 flex items-center gap-1.5 text-[13px] font-bold text-grey-900 max-md:hidden">
          <span aria-hidden="true">⏰</span>
          <span>마감 임박</span>
        </div>
        {/* 좌측 라벨 — 모바일 compact */}
        <div className="shrink-0 hidden max-md:flex items-center gap-1 text-[12px] font-bold text-grey-900">
          <span aria-hidden="true">⏰</span>
        </div>

        {/* 마퀴 뷰포트 (overflow hidden 으로 넘치는 부분 가림) */}
        <div className="flex-1 min-w-0 marquee-viewport overflow-hidden">
          {shouldAnimate ? (
            // 자동 흐름: 원본 세트 + 복제 세트 나란히 → 무한 루프.
            // 점프 방지: 두 그룹 모두에 mr-4(내부 gap 과 동일)를 줘서
            // 전체 width = 2 × (W + gap) 이 되게 함. 이래야 translateX(-50%)
            // 지점에서 복제 첫 카드가 원본 첫 카드 위치와 정확히 일치 → 매끈한 루프.
            <div
              className="marquee-track flex items-center"
              style={{ animationDuration: `${durationSec}s` }}
            >
              <div className="flex items-center gap-4 max-md:gap-3 shrink-0 mr-4 max-md:mr-3">
                {visible.map((p, idx) => renderCard(p, idx, false))}
              </div>
              <div
                className="flex items-center gap-4 max-md:gap-3 shrink-0 mr-4 max-md:mr-3"
                aria-hidden="true"
              >
                {visible.map((p, idx) => renderCard(p, idx, true))}
              </div>
            </div>
          ) : (
            // 아이템이 적을 때: 정적 표시 (가로 스크롤 가능)
            <div className="flex items-center gap-4 max-md:gap-3 overflow-x-auto scrollbar-none">
              {visible.map((p, idx) => renderCard(p, idx, false))}
            </div>
          )}
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
