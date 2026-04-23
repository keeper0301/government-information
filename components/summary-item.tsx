export function SummaryItem({ label, value, fallbackUrl }: { label: string; value: string | null; fallbackUrl?: string | null }) {
  return (
    <div className="py-4">
      <div className="text-[12px] font-bold tracking-[1px] text-grey-600 uppercase mb-1.5">{label}</div>
      {value ? (
        <div className="text-[16px] font-medium text-grey-900 leading-[1.6]">{value}</div>
      ) : (
        <div className="text-[15px] text-grey-600 leading-[1.6]">
          {fallbackUrl ? (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold no-underline hover:underline">
              원문에서 확인하기 →
            </a>
          ) : (
            "정보 수집 중"
          )}
        </div>
      )}
    </div>
  );
}
