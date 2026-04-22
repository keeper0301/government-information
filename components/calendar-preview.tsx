import { createClient } from "@/lib/supabase/server";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 이번 달 마감 예정인 복지/대출 프로그램을 DB에서 가져와서 달력에 표시
export async function CalendarPreview() {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0부터 시작 (0=1월)
  const today = now.getDate();

  // 이번 달의 첫째 날 요일과 총 일수 계산
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // DB 조회용 날짜 범위
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // 복지/대출 마감일 데이터 가져오기
  const [{ data: welfareData }, { data: loanData }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, apply_end")
      .gte("apply_end", monthStart)
      .lte("apply_end", monthEnd),
    supabase
      .from("loan_programs")
      .select("id, title, apply_end")
      .gte("apply_end", monthStart)
      .lte("apply_end", monthEnd),
  ]);

  // 날짜별로 마감 건수 매핑 (복지=blue, 대출=orange)
  const dayDots: Record<number, { blue: number; orange: number }> = {};
  for (const w of welfareData || []) {
    const day = new Date(w.apply_end!).getDate();
    if (!dayDots[day]) dayDots[day] = { blue: 0, orange: 0 };
    dayDots[day].blue++;
  }
  for (const l of loanData || []) {
    const day = new Date(l.apply_end!).getDate();
    if (!dayDots[day]) dayDots[day] = { blue: 0, orange: 0 };
    dayDots[day].orange++;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          {month + 1}월 신청 마감 달력
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
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} className="bg-grey-50 min-h-[68px]" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const dots = dayDots[day];
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
              {dots && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {dots.blue > 0 && (
                    <span className="w-[5px] h-[5px] rounded-full bg-blue-500" />
                  )}
                  {dots.orange > 0 && (
                    <span className="w-[5px] h-[5px] rounded-full bg-orange" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
