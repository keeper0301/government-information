const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const deadlines: Record<number, "blue" | "red" | "green"> = {
  10: "blue",
  14: "green",
  20: "blue",
  31: "red",
};

export function CalendarPreview() {
  const today = 28;
  const emptyDays = 6;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          3월 신청 마감 달력
        </h2>
        <a
          href="/calendar"
          className="text-sm font-medium text-grey-500 no-underline hover:text-blue-500 transition-colors"
        >
          달력 전체보기
        </a>
      </div>
      <div className="grid grid-cols-7 gap-0.5 bg-grey-100 rounded-lg overflow-hidden">
        {DAYS.map((d) => (
          <div
            key={d}
            className="bg-grey-50 py-2.5 text-center text-xs font-semibold text-grey-500"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: emptyDays }).map((_, i) => (
          <div key={`e${i}`} className="bg-grey-50 min-h-[68px]" />
        ))}
        {Array.from({ length: 31 }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const dot = deadlines[day];
          return (
            <div
              key={day}
              className={`relative bg-white p-2.5 pb-3.5 min-h-[68px] text-[13px] font-medium text-right ${
                isToday ? "bg-blue-50" : ""
              }`}
            >
              <span className={isToday ? "text-blue-500 font-bold" : "text-grey-800"}>
                {day}
              </span>
              {dot && (
                <span
                  className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full ${
                    dot === "blue"
                      ? "bg-blue-500"
                      : dot === "red"
                      ? "bg-red"
                      : "bg-green"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
