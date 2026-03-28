import { createClient } from "@/lib/supabase/server";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";

export const revalidate = 600;

type DeadlineItem = {
  id: string;
  title: string;
  source: string;
  apply_end: string;
  type: "welfare" | "loan";
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function CalendarPage() {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const today = now.getDate();

  // First day of month (0=Sun, 6=Sat)
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Format for query: YYYY-MM-01 to YYYY-MM-last
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const [{ data: welfareData }, { data: loanData }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, source, apply_end")
      .gte("apply_end", monthStart)
      .lte("apply_end", monthEnd)
      .order("apply_end", { ascending: true }),
    supabase
      .from("loan_programs")
      .select("id, title, source, apply_end")
      .gte("apply_end", monthStart)
      .lte("apply_end", monthEnd)
      .order("apply_end", { ascending: true }),
  ]);

  const deadlines: DeadlineItem[] = [
    ...(welfareData || []).map((w) => ({ ...w, apply_end: w.apply_end!, type: "welfare" as const })),
    ...(loanData || []).map((l) => ({ ...l, apply_end: l.apply_end!, type: "loan" as const })),
  ].sort((a, b) => a.apply_end.localeCompare(b.apply_end));

  // Map day number -> deadlines
  const dayMap: Record<number, DeadlineItem[]> = {};
  for (const d of deadlines) {
    const day = new Date(d.apply_end).getDate();
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(d);
  }

  const monthName = `${year}년 ${month + 1}월`;

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        신청 마감 달력
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        복지·대출 프로그램의 신청 마감일을 한눈에 확인하세요.
      </p>

      {/* Month label */}
      <div className="text-lg font-bold text-grey-900 mb-4">{monthName}</div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 bg-grey-100 rounded-2xl overflow-hidden mb-10">
        {DAYS.map((d) => (
          <div key={d} className="bg-grey-50 py-2.5 text-center text-xs font-semibold text-grey-500">
            {d}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} className="bg-grey-50 min-h-[80px]" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const items = dayMap[day];
          return (
            <div
              key={day}
              className={`relative bg-white p-2 pb-4 min-h-[80px] text-right ${isToday ? "bg-blue-50" : ""}`}
            >
              <span className={`text-[13px] font-medium ${isToday ? "text-blue-500 font-bold" : "text-grey-800"}`}>
                {day}
              </span>
              {items && (
                <div className="flex gap-1 justify-end mt-1 flex-wrap">
                  {items.map((item) => (
                    <span
                      key={item.id}
                      className={`w-[6px] h-[6px] rounded-full ${item.type === "welfare" ? "bg-blue-500" : "bg-orange"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs text-grey-600">복지</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange" />
          <span className="text-xs text-grey-600">대출·지원금</span>
        </div>
      </div>

      {/* List view */}
      <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900 mb-4">
        {monthName} 마감 예정
      </h2>
      {deadlines.length > 0 ? (
        <div className="flex flex-col">
          {deadlines.map((d) => {
            const day = new Date(d.apply_end).getDate();
            const dday = Math.ceil((new Date(d.apply_end).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return (
              <a
                key={d.id}
                href={`/${d.type}/${d.id}`}
                className="flex items-center gap-4 py-4 border-b border-grey-100 last:border-b-0 no-underline text-inherit hover:bg-grey-50 transition-colors"
              >
                <div className="shrink-0 w-12 text-center">
                  <div className="text-[20px] font-bold text-grey-900">{day}</div>
                  <div className="text-[11px] text-grey-500">{month + 1}월</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-grey-900 mb-0.5">{d.title}</div>
                  <div className="text-[13px] text-grey-500">{d.source}</div>
                </div>
                <div className="shrink-0">
                  {dday >= 0 ? (
                    <span className={`text-[13px] font-bold px-2 py-1 rounded ${dday <= 7 ? "bg-[#FFEEEE] text-red" : "bg-blue-50 text-blue-600"}`}>
                      D-{dday}
                    </span>
                  ) : (
                    <span className="text-[13px] font-bold px-2 py-1 rounded bg-grey-100 text-grey-500">마감</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center text-grey-500">이번 달 마감 예정인 프로그램이 없습니다.</div>
      )}
    </main>
  );
}
