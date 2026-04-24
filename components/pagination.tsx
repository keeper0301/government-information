type Props = {
  currentPage: number;
  totalPages: number;
  buildUrl: (overrides: Record<string, string>) => string;
};

export function Pagination({ currentPage, totalPages, buildUrl }: Props) {
  if (totalPages <= 1) return null;

  // Calculate visible page numbers (max 5 around current)
  const pages: (number | "...")[] = [];

  if (totalPages <= 7) {
    // Show all pages
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push("...");
    }

    // Pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }

    // Always show last page
    pages.push(totalPages);
  }

  return (
    <section className="max-w-content mx-auto px-10 mt-10 mb-4 max-md:px-6">
      <div className="flex items-center justify-center gap-1">
        {/* Previous */}
        {currentPage > 1 ? (
          <a
            href={buildUrl({ page: String(currentPage - 1) })}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-grey-600 hover:bg-grey-100 transition-colors no-underline"
            aria-label="이전 페이지"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 12L6 8l4-4" />
            </svg>
          </a>
        ) : (
          <span className="w-11 h-11 flex items-center justify-center rounded-lg text-grey-300">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 12L6 8l4-4" />
            </svg>
          </span>
        )}

        {/* Page numbers */}
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dot-${i}`} className="w-11 h-11 flex items-center justify-center text-sm text-grey-500">
              ···
            </span>
          ) : (
            <a
              key={p}
              href={buildUrl({ page: String(p) })}
              className={`w-11 h-11 flex items-center justify-center rounded-lg text-sm font-medium no-underline transition-colors ${
                p === currentPage
                  ? "bg-blue-500 text-white"
                  : "text-grey-700 hover:bg-grey-100"
              }`}
            >
              {p}
            </a>
          )
        )}

        {/* Next */}
        {currentPage < totalPages ? (
          <a
            href={buildUrl({ page: String(currentPage + 1) })}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-grey-600 hover:bg-grey-100 transition-colors no-underline"
            aria-label="다음 페이지"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </a>
        ) : (
          <span className="w-11 h-11 flex items-center justify-center rounded-lg text-grey-300">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </span>
        )}
      </div>

      {/* Page info */}
      <div className="text-center mt-3 text-xs text-grey-500">
        {currentPage} / {totalPages} 페이지
      </div>
    </section>
  );
}
