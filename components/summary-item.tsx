// 핵심 정보 카드 안의 1 필드 (label + value).
// value 가 비어있으면 렌더하지 않음 — 기존엔 "원문에서 확인하기" 링크가
// 5개 필드에 반복 노출되어 무성의해 보였기 때문. 채워진 필드만 골라 표시하고
// 하나도 없으면 상위에서 카드 자체를 숨기는 쪽이 정직하다.
export function SummaryItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="py-4">
      <div className="text-[12px] font-bold tracking-[1px] text-grey-600 uppercase mb-1.5">
        {label}
      </div>
      <div className="text-[16px] font-medium text-grey-900 leading-[1.6]">{value}</div>
    </div>
  );
}
