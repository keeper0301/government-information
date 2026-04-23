import { createClient } from "@/lib/supabase/server";

export const revalidate = 600;

// 캘린더 이벤트 — 한 프로그램이 start 와 end 둘 다 이번 달이면 이벤트 2개
type CalendarEvent = {
  id: string;         // program_id + "-start/end"
  programId: string;  // 상세 페이지 링크용
  title: string;
  source: string;
  date: string;       // YYYY-MM-DD — 해당 day 의 key 날짜
  type: "welfare" | "loan";
  kind: "start" | "end";
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatYmd(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const today = now.getDate();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthStart = formatYmd(year, month, 1);
  const monthEnd = formatYmd(year, month, daysInMonth);
  const todayStr = formatYmd(year, month, today);

  // 이번 달 apply_start 또는 apply_end 가 걸친 복지·대출 프로그램 수집
  // PostgREST or() + and() 조합으로 한 번에 처리
  const dateFilter = `and(apply_start.gte.${monthStart},apply_start.lte.${monthEnd}),and(apply_end.gte.${monthStart},apply_end.lte.${monthEnd})`;

  const [{ data: welfareRows }, { data: loanRows }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, source, apply_start, apply_end")
      .or(dateFilter),
    supabase
      .from("loan_programs")
      .select("id, title, source, apply_start, apply_end")
      .or(dateFilter),
  ]);

  // 프로그램 1건 → 최대 2개 이벤트 (start·end 가 둘 다 이번 달이면)
  const events: CalendarEvent[] = [];
  const pushEvents = (
    rows: {
      id: string;
      title: string;
      source: string;
      apply_start: string | null;
      apply_end: string | null;
    }[],
    type: "welfare" | "loan",
  ) => {
    for (const r of rows) {
      if (r.apply_start && r.apply_start >= monthStart && r.apply_start <= monthEnd) {
        events.push({
          id: `${r.id}-start`,
          programId: r.id,
          title: r.title,
          source: r.source,
          date: r.apply_start,
          type,
          kind: "start",
        });
      }
      if (r.apply_end && r.apply_end >= monthStart && r.apply_end <= monthEnd) {
        events.push({
          id: `${r.id}-end`,
          programId: r.id,
          title: r.title,
          source: r.source,
          date: r.apply_end,
          type,
          kind: "end",
        });
      }
    }
  };
  pushEvents(welfareRows ?? [], "welfare");
  pushEvents(loanRows ?? [], "loan");

  // day -> events 맵 (달력 그리드용)
  const dayMap: Record<number, CalendarEvent[]> = {};
  for (const e of events) {
    const day = new Date(e.date).getDate();
    (dayMap[day] ||= []).push(e);
  }

  // 리스트 정렬: 미래(오늘 포함) 가까운 순 → 과거 최근 순 (마감된 건 맨 아래)
  const sortedEvents = [...events].sort((a, b) => {
    const aFuture = a.date >= todayStr;
    const bFuture = b.date >= todayStr;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    if (aFuture) return a.date.localeCompare(b.date);
    return b.date.localeCompare(a.date);
  });

  const upcomingCount = sortedEvents.filter((e) => e.date >= todayStr && e.kind === "end").length;
  const newCount = sortedEvents.filter((e) => e.kind === "start").length;

  const monthName = `${year}년 ${month + 1}월`;

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        신청 일정 달력
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        복지·대출 프로그램의 <b className="text-grey-900">신규 시작일</b>과{" "}
        <b className="text-grey-900">마감일</b>을 한눈에 확인하세요.
      </p>

      {/* 이번 달 요약 */}
      <div className="text-lg font-bold text-grey-900 mb-4">
        {monthName}
        <span className="ml-3 text-[13px] font-medium text-grey-600">
          마감 예정 {upcomingCount}건 · 신규 시작 {newCount}건
        </span>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 bg-grey-100 rounded-2xl overflow-hidden mb-4">
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
              <span
                className={`text-[13px] font-medium ${isToday ? "text-blue-500 font-bold" : "text-grey-800"}`}
              >
                {day}
              </span>
              {items && (
                <div className="flex gap-1 justify-end mt-1 flex-wrap">
                  {items.map((item) => {
                    // 마감 = 채운 점, 시작 = 테두리만
                    const color = item.type === "welfare" ? "bg-blue-500" : "bg-orange";
                    const ringColor = item.type === "welfare" ? "ring-blue-500" : "ring-orange";
                    if (item.kind === "end") {
                      return (
                        <span
                          key={item.id}
                          className={`w-[6px] h-[6px] rounded-full ${color}`}
                          title={`${item.title} — 마감`}
                        />
                      );
                    }
                    return (
                      <span
                        key={item.id}
                        className={`w-[6px] h-[6px] rounded-full bg-white ring-1 ${ringColor}`}
                        title={`${item.title} — 시작`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend — 마감(채움) / 시작(테두리) × 복지/대출 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-8 text-[12px] text-grey-700">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span>복지 마감</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white ring-1 ring-blue-500" />
          <span>복지 시작</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange" />
          <span>대출 마감</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white ring-1 ring-orange" />
          <span>대출 시작</span>
        </div>
      </div>

      {/* List — 미래(가까운 순) → 과거(최근 순). 마감된 항목은 맨 아래 */}
      <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900 mb-4">
        {monthName} 일정
      </h2>
      {sortedEvents.length > 0 ? (
        <div className="flex flex-col">
          {sortedEvents.map((e) => {
            const eventDate = new Date(e.date);
            const day = eventDate.getDate();
            const dday = Math.ceil(
              (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            const isPast = e.date < todayStr;

            // 배지: 시작·마감 × 과거·미래 4가지 조합
            let badgeClass = "";
            let badgeText = "";
            if (e.kind === "end") {
              if (isPast) {
                badgeClass = "bg-grey-100 text-grey-500";
                badgeText = "마감";
              } else if (dday <= 7) {
                badgeClass = "bg-[#FFEEEE] text-red";
                badgeText = `D-${dday}`;
              } else {
                badgeClass = "bg-blue-50 text-blue-600";
                badgeText = `D-${dday}`;
              }
            } else {
              // start
              if (isPast) {
                badgeClass = "bg-grey-100 text-grey-600";
                badgeText = "시작됨";
              } else {
                badgeClass = "bg-green/10 text-green";
                badgeText = dday === 0 ? "오늘 시작" : `${dday}일 후 시작`;
              }
            }

            return (
              <a
                key={e.id}
                href={`/${e.type}/${e.programId}`}
                className={`flex items-center gap-4 py-4 border-b border-grey-100 last:border-b-0 no-underline text-inherit hover:bg-grey-50 transition-colors ${isPast ? "opacity-60" : ""}`}
              >
                <div className="shrink-0 w-12 text-center">
                  <div className="text-[20px] font-bold text-grey-900">{day}</div>
                  <div className="text-[11px] text-grey-500">{month + 1}월</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        e.kind === "start"
                          ? "bg-green/10 text-green"
                          : "bg-grey-100 text-grey-700"
                      }`}
                    >
                      {e.kind === "start" ? "🆕 시작" : "⏰ 마감"}
                    </span>
                    <span className="text-[15px] font-semibold text-grey-900 truncate">
                      {e.title}
                    </span>
                  </div>
                  <div className="text-[13px] text-grey-500">{e.source}</div>
                </div>
                <div className="shrink-0">
                  <span className={`text-[13px] font-bold px-2 py-1 rounded ${badgeClass}`}>
                    {badgeText}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center text-grey-500">
          이번 달 일정이 없습니다.
        </div>
      )}
    </main>
  );
}
