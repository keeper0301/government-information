import { createClient } from "@/lib/supabase/server";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 날짜별 사업 항목 타입
type CalendarItem = {
  id: string;
  title: string;
  type: "welfare" | "loan";
};

// 달력 표시용으로 제목에서 연도 제거 (예: "2026년 청년 월세" → "청년 월세")
function shortenTitle(title: string): string {
  return title
    .replace(/^\d{4}년도?\s*/g, "")
    .replace(/^「|」/g, "")
    .trim();
}

// 이번 달 마감 예정인 복지/대출 프로그램을 DB에서 가져와서 달력에 표시
export async function CalendarPreview() {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

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

  // 날짜별로 사업 항목 매핑
  const dayItems: Record<number, CalendarItem[]> = {};
  for (const w of welfareData || []) {
    const day = new Date(w.apply_end!).getDate();
    if (!dayItems[day]) dayItems[day] = [];
    dayItems[day].push({ id: w.id, title: w.title, type: "welfare" });
  }
  for (const l of loanData || []) {
    const day = new Date(l.apply_end!).getDate();
    if (!dayItems[day]) dayItems[day] = [];
    dayItems[day].push({ id: l.id, title: l.title, type: "loan" });
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
        {/* 요일 헤더 */}
        {DAYS.map((d) => (
          <div
            key={d}
            className="bg-grey-50 py-2.5 text-center text-xs font-semibold text-grey-500"
          >
            {d}
          </div>
        ))}
        {/* 빈 칸 (1일 시작 전) */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} className="bg-grey-50 min-h-[90px] max-md:min-h-[68px]" />
        ))}
        {/* 날짜 칸 */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const items = dayItems[day];
          return (
            <div
              key={day}
              className={`relative bg-white p-1.5 min-h-[90px] max-md:min-h-[68px] text-[13px] font-medium overflow-hidden ${
                isToday ? "bg-blue-50" : ""
              }`}
            >
              {/* 날짜 숫자 */}
              <div className="text-right mb-1">
                <span className={isToday ? "text-blue-500 font-bold" : "text-grey-800"}>
                  {day}
                </span>
              </div>
              {/* 사업명 태그 (최대 2개 + 더보기) */}
              {items && (
                <div className="flex flex-col gap-[3px]">
                  {items.slice(0, 2).map((item) => (
                    <a
                      key={item.id}
                      href={`/${item.type}/${item.id}`}
                      className={`block text-[10px] leading-[1.3] px-1 py-[2px] rounded truncate no-underline max-md:hidden hover:opacity-80 transition-opacity ${
                        item.type === "welfare"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-[#FFF4E6] text-[#E8590C]"
                      }`}
                      title={item.title}
                    >
                      {shortenTitle(item.title)}
                    </a>
                  ))}
                  {items.length > 2 && (
                    <div className="text-[10px] text-grey-500 px-1 max-md:hidden">
                      +{items.length - 2}건
                    </div>
                  )}
                  {/* 모바일에서는 점으로 표시 */}
                  <div className="hidden max-md:flex gap-1 justify-center mt-1">
                    {items.some((it) => it.type === "welfare") && (
                      <span className="w-[5px] h-[5px] rounded-full bg-blue-500" />
                    )}
                    {items.some((it) => it.type === "loan") && (
                      <span className="w-[5px] h-[5px] rounded-full bg-orange" />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
