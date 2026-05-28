// ============================================================
// 정책 상세 자체 가치 박스 — keepioo 자체 작성 콘텐츠
// ============================================================
// ai_tips/ai_faq/ai_checklist 가 있으면 3 섹션 렌더.
// 모두 NULL 이면 template fallback (자체 가치 0 보다 나음).
// ============================================================

type Props = {
  tips: string | null;
  faq: string | null;
  checklist: string | null;
  category?: string | null;
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

export function PolicyGuideBox({ tips, faq, checklist, category }: Props) {
  const hasAny = Boolean(tips || faq || checklist);

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

      {hasAny ? (
        <>
          {tips && <Row label="이용 팁" value={tips} />}
          {faq && <Row label="자주 묻는 거절 사유" value={faq} />}
          {checklist && <Row label="신청 체크리스트" value={checklist} />}
        </>
      ) : (
        <div className="text-[14px] text-grey-800 leading-[1.7]">
          {category ? `${category} ` : ""}지원 정책은 대상 조건·마감일·필요 서류를
          미리 확인하면 신청이 수월합니다. 신청 자격과 제출 서류는 아래 공고 내용에서
          확인하고, 최종 신청·확인은 공식 사이트에서 진행해 주세요.
        </div>
      )}
    </section>
  );
}
