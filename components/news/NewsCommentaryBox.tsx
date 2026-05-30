// ============================================================
// news 상세 자체 해설 박스 — keepioo 자체 작성 콘텐츠 (P2)
// ============================================================
// ai_commentary 가 있으면 박스 렌더. NULL 이면 미표시 (selective noindex 유지).
// PolicyGuideBox 의 news 버전 — 외부 보도자료 원본 + keepioo 자체 해석.
// AdSense "scaled content" 정책 방어 + originality 보강.
// ============================================================

type Props = {
  commentary: string | null;
};

export function NewsCommentaryBox({ commentary }: Props) {
  // NULL = 백필 미완료 → 박스 미표시 (사용자에게 빈 박스 노출 X).
  if (!commentary || commentary.trim().length === 0) return null;

  return (
    <section className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-8 mb-6 max-md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[18px]">💡</span>
        <h2 className="text-[16px] font-bold text-emerald-900">
          이 뉴스가 시민에게 의미하는 것
        </h2>
      </div>
      <div className="text-[14px] text-grey-800 leading-[1.7] whitespace-pre-line">
        {commentary}
      </div>
      <div className="mt-4 text-[11px] text-grey-500">
        ※ keepioo 자체 작성 해설 (AI 보조). 원본 보도자료는 아래 본문 참조.
      </div>
    </section>
  );
}
