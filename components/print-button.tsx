'use client';
// 단순 print 트리거 — window.print() 호출.
// ApplicationDraftView 의 클라이언트 island. 본문은 server-rendered 유지.

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center min-h-[48px] px-6 text-[15px] font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 border-0 cursor-pointer transition-colors max-md:w-full max-md:justify-center"
    >
      📄 PDF 로 인쇄
    </button>
  );
}
