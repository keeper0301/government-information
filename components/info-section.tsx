// ============================================================
// InfoSection — 정책 상세 페이지의 정보 섹션 카드
// ============================================================
// 공고 내용·상세 내용·선정 기준·문의처 등 모두 같은 디자인 언어로 통일.
// 흰 카드 + 옅은 테두리 + 부드러운 그림자 — 회색 배경 위에 자연스럽게 떠 보이도록.
// ============================================================

export function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-grey-200 rounded-2xl p-8 mb-6 max-md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <h2 className="text-[17px] font-bold text-grey-900 mb-4 tracking-[-0.3px]">
        {title}
      </h2>
      <div className="text-[15px] text-grey-700 leading-[1.7] whitespace-pre-line">
        {children}
      </div>
    </section>
  );
}
