import { createClient } from "@/lib/supabase/server";
import { shortenCalendarTitle } from "@/lib/utils";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 한 프로그램이 같은 달에 시작·마감 둘 다 있으면 이벤트 2개로 분리.
// /calendar 풀 페이지와 동일 패턴 (시작 = ring dot, 마감 = 채움 dot).
type CalendarEvent = {
  id: string;        // 이벤트 id (programId + "-start/end") — React key 충돌 방지
  programId: string; // 상세 페이지 링크용 원본 id
  title: string;
  type: "welfare" | "loan";
  kind: "start" | "end";
};

// 이번 달 신청 시작·마감 예정인 복지/대출 프로그램을 달력에 표시
export async function CalendarPreview() {
  const supabase = await createClient();

  // 한국 시간(KST, UTC+9) 기준으로 "오늘" 결정. /calendar 풀 페이지와 동일 패턴.
  // Vercel 기본 타임존이 UTC 라 그대로 쓰면 KST 00:00~09:00 창에서 서버가
  // "어제" 를 오늘로 판정 → 한국 사용자 달력과 하루(때론 한 달) 어긋남.
  // now.getTime() 에 9h 를 더해 가상 KST 시점을 만든 뒤 UTC 메서드로 추출.
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  const today = kstNow.getUTCDate();

  // 월의 첫 요일·일수 — Date.UTC 로 생성해 서버 로컬 타임존 영향 제거
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // PostgREST or() 로 apply_start 또는 apply_end 가 이번 달인 행 모두 조회.
  // /calendar 페이지(app/calendar/page.tsx) 와 동일 패턴.
  const dateFilter = `and(apply_start.gte.${monthStart},apply_start.lte.${monthEnd}),and(apply_end.gte.${monthStart},apply_end.lte.${monthEnd})`;

  const [{ data: welfareData }, { data: loanData }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, apply_start, apply_end")
      .or(dateFilter),
    supabase
      .from("loan_programs")
      .select("id, title, apply_start, apply_end")
      .or(dateFilter),
  ]);

  // 한 프로그램 → 최대 2개 이벤트 (start, end 가 둘 다 이번 달이면 2개)
  const dayItems: Record<number, CalendarEvent[]> = {};
  const pushEvents = (
    rows: { id: string; title: string; apply_start: string | null; apply_end: string | null }[],
    type: "welfare" | "loan",
  ) => {
    for (const r of rows) {
      if (r.apply_start && r.apply_start >= monthStart && r.apply_start <= monthEnd) {
        const day = new Date(r.apply_start).getUTCDate();
        (dayItems[day] ??= []).push({
          id: `${r.id}-start`, programId: r.id, title: r.title, type, kind: "start",
        });
      }
      if (r.apply_end && r.apply_end >= monthStart && r.apply_end <= monthEnd) {
        const day = new Date(r.apply_end).getUTCDate();
        (dayItems[day] ??= []).push({
          id: `${r.id}-end`, programId: r.id, title: r.title, type, kind: "end",
        });
      }
    }
  };
  pushEvents(welfareData ?? [], "welfare");
  pushEvents(loanData ?? [], "loan");

  // 같은 날짜: 마감(액션 긴급) 이 시작보다 먼저 → 복지가 대출보다 먼저
  for (const k of Object.keys(dayItems)) {
    dayItems[Number(k)].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "end" ? -1 : 1;
      if (a.type !== b.type) return a.type === "welfare" ? -1 : 1;
      return 0;
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          {month + 1}월 신청 일정 달력
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
        {DAYS.map((d) => (
          <div
            key={d}
            className="bg-white py-3 text-center text-[11px] font-bold text-grey-600"
            style={{ letterSpacing: "3px" }}
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} className="bg-white min-h-[104px] max-md:min-h-[72px]" />
        ))}
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
              <div
                className={`tabular-nums leading-none mb-2 ${
                  isToday
                    ? "text-blue-700 font-bold text-[22px]"
                    : "text-grey-700 font-semibold text-[17px]"
                }`}
              >
                {day}
              </div>
              {items && (
                <div className="flex flex-col gap-[4px]">
                  {items.slice(0, 2).map((item) => {
                    const baseColor = item.type === "welfare" ? "#3182F6" : "#FE9800";
                    return (
                      <a
                        key={item.id}
                        href={`/${item.type}/${item.programId}`}
                        className="flex items-start gap-1.5 no-underline group max-md:hidden"
                        title={`${item.title} — ${item.kind === "end" ? "마감" : "시작"}`}
                      >
                        {/* 마감 = 채움 dot / 시작 = 빈 ring dot (정보 보존) */}
                        {item.kind === "end" ? (
                          <span
                            aria-hidden="true"
                            className="shrink-0 mt-[5px] w-[6px] h-[6px] rounded-full"
                            style={{ backgroundColor: baseColor }}
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="shrink-0 mt-[5px] w-[6px] h-[6px] rounded-full bg-white"
                            style={{ boxShadow: `inset 0 0 0 1.5px ${baseColor}` }}
                          />
                        )}
                        <span className="text-[11.5px] leading-[1.4] text-grey-800 group-hover:text-grey-900 font-medium truncate">
                          {shortenCalendarTitle(item.title)}
                        </span>
                      </a>
                    );
                  })}
                  {items.length > 2 && (
                    <div className="tabular-nums font-semibold text-[12px] text-grey-600 pl-[14px] max-md:hidden">
                      +{items.length - 2}
                    </div>
                  )}
                  {/* 모바일: 카테고리별 dot 1개씩 (시작/마감 구분은 데스크톱만) */}
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
      {/* 범례 — 카테고리(복지·대출) + 시작/마감 구분 (데스크톱만) */}
      <div className="hidden md:flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[13px] text-grey-600">
        <div className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-blue-500" aria-hidden="true" />
          <span>복지·수혜</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#FE9800]" aria-hidden="true" />
          <span>대출·지원금</span>
        </div>
        <span aria-hidden="true" className="hidden md:block w-px h-3 bg-grey-200" />
        <div className="flex items-center gap-1.5 text-grey-500 text-[12px]">
          <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full bg-grey-600" />
          <span>마감</span>
          <span
            aria-hidden="true"
            className="ml-2 w-[7px] h-[7px] rounded-full bg-white"
            style={{ boxShadow: "inset 0 0 0 1.5px #8B95A1" }}
          />
          <span>시작</span>
        </div>
      </div>
    </div>
  );
}
