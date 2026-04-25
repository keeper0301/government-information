// ============================================================
// CategoryChipBar — 카테고리 칩 그룹 컴포넌트
// ============================================================
// /welfare, /loan, /news, /blog 4페이지가 사용.
// variant 차이:
//   "tab"    — blue-500 active, min-h-[44px], "전체" 칩 항상 첫 자리 (welfare/loan/blog)
//   "filter" — grey-900 active, min-h-[32px], 같은 칩 재클릭 시 토글 해제 (news)
// ============================================================
import type { CategoryCount } from "@/lib/category-counts";

type Variant = "tab" | "filter";

type Props = {
  items: CategoryCount[];
  /** 현재 선택된 카테고리. tab variant 에서는 null/undefined 면 "전체" 활성. */
  active: string | null;
  /** 카테고리 클릭 시 이동할 URL. variant=filter 의 토글 해제는 selected 인자가 true 일 때 호출. */
  hrefFor: (category: string | null, selected: boolean) => string;
  /** href for the "전체" pseudo-chip. tab variant 에서만 사용. */
  allHref?: string;
  variant?: Variant;
};

const baseChip =
  "inline-flex items-center text-sm font-medium rounded-full no-underline transition-colors";

const variantClasses: Record<
  Variant,
  { size: string; activeBg: string; inactiveBg: string }
> = {
  tab: {
    size: "px-4 py-2 max-md:py-2.5 max-md:min-h-[44px]",
    activeBg: "bg-blue-500 text-white",
    inactiveBg: "bg-grey-50 text-grey-700 hover:bg-grey-100",
  },
  filter: {
    size: "min-h-[32px] px-3 text-[13px]",
    activeBg: "bg-grey-900 text-white font-semibold",
    inactiveBg:
      "bg-grey-50 text-grey-700 border border-grey-100 hover:bg-grey-100",
  },
};

export function CategoryChipBar({
  items,
  active,
  hrefFor,
  allHref,
  variant = "tab",
}: Props) {
  const v = variantClasses[variant];

  return (
    <div className="flex gap-1.5 flex-wrap">
      {/* tab variant 만 "전체" 칩 노출 — filter variant 는 "필터 해제" 텍스트 링크를
          상위 컴포넌트가 별도 위치에 둠 (news 페이지의 디자인 결정). */}
      {variant === "tab" && allHref && (
        <a
          href={allHref}
          className={`${baseChip} ${v.size} ${
            !active || active === "전체" ? v.activeBg : v.inactiveBg
          }`}
        >
          전체
        </a>
      )}
      {items.map((c) => {
        const selected = active === c.category;
        return (
          <a
            key={c.category}
            href={hrefFor(c.category, selected)}
            aria-current={selected ? "page" : undefined}
            className={`${baseChip} ${v.size} ${
              selected ? v.activeBg : v.inactiveBg
            }`}
          >
            {c.category}{" "}
            <span className="opacity-70 ml-1">({c.n.toLocaleString()})</span>
          </a>
        );
      })}
    </div>
  );
}
