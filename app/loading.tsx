// ============================================================
// 전역 로딩 fallback (app/loading.tsx)
// ============================================================
// Next.js App Router 의 loading convention. force-dynamic 페이지가 첫 paint
// 까지 흰 화면을 보이는 UX 약점 차단.
//
// 동작:
//   - root fallback 으로 모든 segment 에 적용 (segment 별 더 가까운 loading.tsx 우선)
//   - SSR 시 즉시 표시 → 데이터 fetch 완료 후 실제 페이지 swap
//   - 사이트 헤더(nav) 는 layout 에서 그대로 유지 → 부분 swap 만
//
// 디자인:
//   - 사이트 토스 풍 토큰과 일관 (bg-grey-50, blue-500, 토스 회전 spinner)
//   - 한국어 안내 문구 — 비개발자 사장님 운영 페이지 톤 일관
//   - 접근성: role=status + aria-live=polite + 시각 외 sr-only 텍스트
// ============================================================

export default function Loading() {
  return (
    <main
      className="min-h-screen bg-grey-50 flex items-center justify-center px-5 py-20"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        {/* 토스 풍 spinner — 16px 굵은 ring + blue-500 강조 + 부드러운 회전 */}
        <div
          className="w-12 h-12 rounded-full border-4 border-grey-200 border-t-blue-500 mx-auto animate-spin"
          aria-hidden="true"
        />
        <p className="mt-5 text-[14px] text-grey-700 font-medium">
          정책 정보를 불러오고 있어요
        </p>
        {/* sr-only — 스크린 리더용 추가 텍스트 */}
        <span className="sr-only">로딩 중</span>
      </div>
    </main>
  );
}
