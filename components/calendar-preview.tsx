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
          className="text-sm font-medium text-grey-600 no-underline hover:text-blue-500 transition-colors"
        >
          달력 전체보기
        </a>
      </div>
      {/* 달력: dot marker + Pretendard tabular-nums 숫자 + 요일 라벨 (핀테크 톤) */}
      <div className="grid grid-cols-7 gap-px bg-grey-200 rounded-xl overflow-hidden border border-grey-200">
        {/* 요일 헤더 (small caps tracking) */}
        {DAYS.map((d) => (
          <div
            key={d}
            className="bg-white py-3 text-center text-[11px] font-bold text-grey-600"
            style={{ letterSpacing: "3px" }}
          >
            {d}
          </div>
        ))}
        {/* 빈 칸 (1일 시작 전) */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} className="bg-white min-h-[104px] max-md:min-h-[72px]" />
        ))}
        {/* 날짜 칸 */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const items = dayItems[day];
          return (
            <div
              key={day}
              className={`relative p-2 min-h-[104px] max-md:min-h-[72px] overflow-hidden transition-colors ${
                isToday ? "bg-blue-50" : "bg-white"
              }`}
            >
              {/* 날짜 숫자 — 좌상단 + Pretendard tabular-nums (편집물 톤 폐기) */}
              <div
                className={`tabular-nums leading-none mb-2 ${
                  isToday
                    ? "text-blue-700 font-bold text-[22px]"
                    : "text-grey-700 font-semibold text-[17px]"
                }`}
              >
                {day}
              </div>
              {/* 사업명 — dot + 어두운 텍스트 (데스크톱) */}
              {items && (
                <div className="flex flex-col gap-[4px]">
                  {items.slice(0, 2).map((item) => (
                    <a
                      key={item.id}
                      href={`/${item.type}/${item.id}`}
                      className="flex items-start gap-1.5 no-underline group max-md:hidden"
                      title={item.title}
                    >
                      <span
                        aria-hidden="true"
                        className={`shrink-0 mt-[5px] w-[6px] h-[6px] rounded-full ${
                          item.type === "welfare"
                            ? "bg-blue-500"            /* 복지 dot — 토스 blue500 */
                            : "bg-[#FE9800]"           /* 대출 dot — 토스 orange500 */
                        }`}
                      />
                      <span className="text-[11.5px] leading-[1.4] text-grey-800 group-hover:text-grey-900 font-medium truncate">
                        {shortenTitle(item.title)}
                      </span>
                    </a>
                  ))}
                  {items.length > 2 && (
                    <div className="tabular-nums font-semibold text-[12px] text-grey-600 pl-[14px] max-md:hidden">
                      +{items.length - 2}
                    </div>
                  )}
                  {/* 모바일에서는 점만 */}
                  <div className="hidden max-md:flex gap-1 justify-center mt-1">
                    {items.some((it) => it.type === "welfare") && (
                      <span className="w-[6px] h-[6px] rounded-full bg-blue-500" />
                    )}
                    {items.some((it) => it.type === "loan") && (
                      <span className="w-[6px] h-[6px] rounded-full bg-[#FE9800]" />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* 범례 (데스크톱) */}
      <div className="hidden md:flex items-center gap-5 mt-4 text-[13px] text-grey-600">
        <div className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-blue-500" aria-hidden="true" />
          <span>복지·수혜</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#FE9800]" aria-hidden="true" />
          <span>대출·지원금</span>
        </div>
      </div>
    </div>
  );
}
