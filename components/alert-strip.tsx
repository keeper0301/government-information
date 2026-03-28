export function AlertStrip() {
  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6">
      <div className="flex items-center border-b border-grey-100 py-[18px] gap-3.5 cursor-pointer hover:opacity-75 transition-opacity">
        <span className="shrink-0 text-xs font-bold text-white bg-red rounded-[5px] px-2 py-[3px]">
          D-3
        </span>
        <span className="flex-1 text-[15px] font-medium text-grey-800 truncate">
          2026 청년 주거안정 월세지원 신청이 3일 후 마감됩니다
        </span>
        <span className="shrink-0 text-[13px] font-medium text-grey-500">
          3.31 마감
        </span>
      </div>
    </div>
  );
}
