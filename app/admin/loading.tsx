// app/admin/loading.tsx
// ============================================================
// 관리자 전용 로딩 fallback
// ============================================================
// 전역 app/loading.tsx 는 공개 페이지 SEO 를 위해 마케팅 카피와 full-page <main>
// 구조를 담는다. /admin 은 인증·동적 데이터·스트리밍 경로라 전역 fallback 이
// root layout 의 Nav/Footer 사이에서 먼저 들어오며 프로덕션 hydration #418 을
// 유발할 수 있어, 관리자 구간에는 더 작고 안정적인 skeleton 을 사용한다.
// ============================================================

export default function AdminLoading() {
  return (
    <div
      className="flex min-h-[calc(100vh-58px)] bg-white pt-[58px]"
      role="status"
      aria-live="polite"
    >
      <aside className="hidden w-[200px] flex-shrink-0 border-r border-grey-200 bg-grey-50 md:block xl:w-[280px]" />
      <main className="flex-1 px-4 py-6 md:px-7 md:py-10 xl:px-12">
        <div className="mb-8">
          <div className="mb-3 h-3 w-16 rounded-full bg-blue-100" />
          <div className="h-8 w-56 rounded-lg bg-grey-100" />
          <div className="mt-3 h-4 w-full max-w-2xl rounded bg-grey-100" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-40 rounded-2xl border border-grey-200 bg-grey-50" />
          <div className="h-40 rounded-2xl border border-grey-200 bg-grey-50" />
          <div className="h-40 rounded-2xl border border-grey-200 bg-grey-50" />
        </div>
        <span className="sr-only">관리자 화면을 불러오는 중</span>
      </main>
    </div>
  );
}
