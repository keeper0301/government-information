// ============================================================
// 정책 상세 안내 — 원문 근거와 운영자 검수가 있는 설명만 공개한다.
// ============================================================
// 기존 자동 설명은 보존하되 공개하지 않는다.
// 검수 전에는 원문 확인이 진행 중이라는 안내만 표시한다.
// ============================================================

import type { EvidenceGuide } from '@/lib/policy/evidence-guide';

type Props = {
  tips: string | null;
  faq: string | null;
  checklist: string | null;
  category?: string | null;
  guide?: EvidenceGuide | null;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[14px] font-bold text-grey-900 mb-1">{label}</div>
      <div className="text-[14px] text-grey-800 leading-[1.7] whitespace-pre-line">
        {value}
      </div>
    </div>
  );
}

export function PolicyGuideBox({ guide }: Props) {

  return (
    <section className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-8 mb-6 max-md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[17px] font-bold text-grey-900 tracking-[-0.3px]">
          신청 전에 알아두면 좋은 점
        </h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          keepioo 안내
        </span>
      </div>

      {guide ? (
        <>
          {guide.sections.map((section, index) => <div key={index}>
            <Row label={section.label} value={section.text} />
            <details className="text-sm mb-4"><summary>공고 근거 확인</summary>
              <blockquote>{section.quote}</blockquote>
              <a href={guide.source.url} target="_blank" rel="noopener noreferrer">확인한 원문 보기</a>
            </details>
          </div>)}
          <p className="text-xs">운영자 검수일: {guide.reviewedAt?.slice(0, 10)}</p>
        </>
      ) : (
        <div className="text-[14px] text-grey-800 leading-[1.7]">
          이 사업의 신청 안내는 원문 대조와 검수 중입니다. 확인되지 않은 서류나 거절 사유를 안내하지 않습니다.
        </div>
      )}
    </section>
  );
}
