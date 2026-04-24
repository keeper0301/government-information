// ============================================================
// Pagination — 목록 페이지 공통 페이지네이션
// ============================================================
// shadcn Pagination primitive 위에 keepioo 의 buildUrl API 를 얹어
// 목록(welfare/loan/blog/news) 어디든 동일 시그니처로 호출.
//
// 2026-04-24 shadcn 전환:
//   - Nav 시맨틱(role=navigation, aria-label) 자동 확보
//   - 이전/다음은 shadcn PaginationPrevious/Next (ChevronLeft/RightIcon)
//   - 활성 페이지는 isActive prop (outline variant)
//   - "..." 은 PaginationEllipsis (MoreHorizontalIcon + sr-only 안내)
// ============================================================

import {
  Pagination as ShadcnPagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Props = {
  currentPage: number;
  totalPages: number;
  buildUrl: (overrides: Record<string, string>) => string;
};

export function Pagination({ currentPage, totalPages, buildUrl }: Props) {
  if (totalPages <= 1) return null;

  // 표시할 페이지 번호 계산 — 최대 현재 기준 ±1 + 처음/끝 + "..."
  // 전체 7쪽 이하면 모두 표시, 그 이상이면 축약 ("1 … 4 5 6 … 10").
  const pages: (number | "ellipsis-left" | "ellipsis-right")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("ellipsis-left");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("ellipsis-right");
    pages.push(totalPages);
  }

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <section className="max-w-content mx-auto px-10 mt-10 mb-4 max-md:px-6">
      <ShadcnPagination>
        <PaginationContent>
          {/* 이전 — 첫 페이지면 aria-disabled + 회색 + 클릭 차단.
              PaginationLink/Prev/Next 는 내부에서 이미 <Button asChild><a>> 구조라
              외부에서 추가 asChild 불가. href 직접 전달 → Next.js 는 <a> 도
              prefetch 감지. 서버 렌더 목록이라 full page reload 감수 가능. */}
          <PaginationItem>
            {hasPrev ? (
              <PaginationPrevious
                href={buildUrl({ page: String(currentPage - 1) })}
                aria-label="이전 페이지"
                text="이전"
              />
            ) : (
              <PaginationPrevious
                aria-disabled="true"
                className="text-grey-300 pointer-events-none"
                text="이전"
                href="#"
              />
            )}
          </PaginationItem>

          {/* 페이지 번호 */}
          {pages.map((p, i) => {
            if (p === "ellipsis-left" || p === "ellipsis-right") {
              return (
                <PaginationItem key={`${p}-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }
            const isActive = p === currentPage;
            return (
              <PaginationItem key={p}>
                <PaginationLink
                  href={buildUrl({ page: String(p) })}
                  isActive={isActive}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            );
          })}

          {/* 다음 — 마지막 페이지면 aria-disabled + 회색 + 클릭 차단 */}
          <PaginationItem>
            {hasNext ? (
              <PaginationNext
                href={buildUrl({ page: String(currentPage + 1) })}
                aria-label="다음 페이지"
                text="다음"
              />
            ) : (
              <PaginationNext
                aria-disabled="true"
                className="text-grey-300 pointer-events-none"
                text="다음"
                href="#"
              />
            )}
          </PaginationItem>
        </PaginationContent>
      </ShadcnPagination>

      {/* 페이지 정보 — 시각적 보조. SEO 나 스크린리더엔 큰 가치 없어 텍스트만. */}
      <div className="text-center mt-3 text-xs text-grey-500">
        {currentPage} / {totalPages} 페이지
      </div>
    </section>
  );
}
