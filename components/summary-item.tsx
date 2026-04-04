export function SummaryItem({ label, value, fallbackUrl }: { label: string; value: string | null; fallbackUrl?: string | null }) {
  return (
    <div className="py-3">
      <div className="text-[13px] font-medium text-grey-500 mb-1">{label}</div>
      {value ? (
        <div className="text-[15px] text-grey-900 leading-[1.5]">{value}</div>
      ) : (
        <div className="text-[14px] text-grey-400 leading-[1.5]">
          {fallbackUrl ? (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline hover:underline">
              원문에서 확인하기
            </a>
          ) : (
            "정보 수집 중"
          )}
        </div>
      )}
    </div>
  );
}
