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

  // 한국 시간(KST, UTC+9) 기준으로 년·월·일 해석.
  // Vercel 기본 타임존이 UTC 라 그대로 쓰면 KST 00:00 ~ 09:00 창에서
  // 서버가 "어제"를 오늘로 판정 → 한국 사용자 달력과 하루 어긋남.
  // now.getTime() 에 9h 를 더해 가상 "KST 시점" 을 만든 뒤
  // UTC 메서드로 년·월·일을 뽑는 트릭 (외부 라이브러리 없이 처리).
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth(); // 0-indexed
  const today = kstNow.getUTCDate();

  // 월의 첫 요일·일수 — Date.UTC 로 생성해 서버 로컬 타임존 영향 제거
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

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
  // e.date 는 "YYYY-MM-DD" 포맷 → new Date() 가 UTC 자정으로 파싱하므로
  // getUTCDate() 를 써야 서버 로컬 타임존 무관하게 일자를 정확히 추출
  const dayMap: Record<number, CalendarEvent[]> = {};
  for (const e of events) {
    const day = new Date(e.date).getUTCDate();
    (dayMap[day] ||= []).push(e);
  }

  // 하단 리스트용 — 시작/마감을 두 섹션으로 분리 (가독성 ↑)
  // - 마감: 오늘 이후(D-1 이상)만 노출. D-0·과거는 제외 (이미 끝났거나 임박한 것은 액션 불가)
  // - 시작: 오늘 포함 미래만 노출 (오늘 열린 공고는 유저가 꼭 확인해야 함)
  const upcomingEndings = events
    .filter((e) => e.kind === "end" && e.date > todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcomingStarts = events
    .filter((e) => e.kind === "start" && e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 상단 요약도 하단과 동일 기준("앞으로 남은 것")으로 맞춰 일관성 유지
  const upcomingCount = upcomingEndings.length;
  const newCount = upcomingStarts.length;

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
          <div key={d} className="bg-grey-50 py-2.5 text-center text-xs font-semibold text-grey-600">
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
                      // 시작 이벤트 — ring-2 로 두껍게 해야 6px 작은 원에서도
                      // "테두리 원" 이 "채움 원" 과 확실히 구별됨 (범례와 두께 통일)
                      <span
                        key={item.id}
                        className={`w-[6px] h-[6px] rounded-full bg-white ring-2 ${ringColor}`}
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

      {/* Legend — 2×2 테이블로 재구성 (행=카테고리, 열=상태)
          기존: 한 줄 4개 나열 → 축 구분 모호 + 6~8px 점이라 채움/테두리 차이 불분명
          개선: 헤더로 축 명시 + 점 크기 ↑ + ring 두께 ↑ → 4종이 한눈에 구별됨 */}
      <div className="mb-8 inline-block">
        <div className="grid grid-cols-[auto_auto_auto] gap-x-8 gap-y-3 items-center border border-grey-200 rounded-lg p-4 bg-white">
          {/* 헤더 행 — 상태 축 (마감 / 시작) */}
          <div />
          <div className="text-[11px] font-bold text-grey-600 tracking-wider">
            <span aria-hidden="true">● </span>마감
          </div>
          <div className="text-[11px] font-bold text-grey-600 tracking-wider">
            <span aria-hidden="true">○ </span>시작
          </div>

          {/* 복지 행 */}
          <div className="text-[12px] font-bold text-grey-800 pr-2">복지</div>
          <div className="flex items-center gap-2 text-[13px] text-grey-700">
            <span
              className="w-3.5 h-3.5 rounded-full bg-blue-500 shrink-0"
              aria-hidden="true"
            />
            <span>복지 마감</span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-grey-700">
            <span
              className="w-3.5 h-3.5 rounded-full bg-white ring-2 ring-blue-500 shrink-0"
              aria-hidden="true"
            />
            <span>복지 시작</span>
          </div>

          {/* 대출 행 */}
          <div className="text-[12px] font-bold text-grey-800 pr-2">대출</div>
          <div className="flex items-center gap-2 text-[13px] text-grey-700">
            <span
              className="w-3.5 h-3.5 rounded-full bg-orange shrink-0"
              aria-hidden="true"
            />
            <span>대출 마감</span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-grey-700">
            <span
              className="w-3.5 h-3.5 rounded-full bg-white ring-2 ring-orange shrink-0"
              aria-hidden="true"
            />
            <span>대출 시작</span>
          </div>
        </div>
      </div>

      {/* List — 마감 예정 / 신규 시작 두 섹션으로 분리 (가독성 ↑)
          각 섹션 내부는 날짜 오름차순. 과거·D-0 마감은 숨김 (액션 불가 정보). */}
      <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900 mb-6">
        {monthName} 일정
      </h2>

      <div className="space-y-10">
        {/* ⏰ 마감 예정 섹션 */}
        <section aria-labelledby="section-endings">
          <div className="flex items-baseline gap-2 mb-4 pb-2 border-b-2 border-grey-200">
            <h3 id="section-endings" className="text-[17px] font-bold text-grey-900">
              <span aria-hidden="true">⏰ </span>마감 예정
            </h3>
            <span className="text-[13px] font-medium text-grey-600">
              {upcomingEndings.length}건
            </span>
          </div>
          {upcomingEndings.length > 0 ? (
            <div className="flex flex-col">
              {upcomingEndings.map((e) => renderEventRow(e, kstNow, month))}
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-grey-600 bg-grey-50 rounded-lg">
              이번 달 남은 마감 예정이 없어요.
            </div>
          )}
        </section>

        {/* 🆕 신규 시작 섹션 */}
        <section aria-labelledby="section-starts">
          <div className="flex items-baseline gap-2 mb-4 pb-2 border-b-2 border-grey-200">
            <h3 id="section-starts" className="text-[17px] font-bold text-grey-900">
              <span aria-hidden="true">🆕 </span>신규 시작
            </h3>
            <span className="text-[13px] font-medium text-grey-600">
              {upcomingStarts.length}건
            </span>
          </div>
          {upcomingStarts.length > 0 ? (
            <div className="flex flex-col">
              {upcomingStarts.map((e) => renderEventRow(e, kstNow, month))}
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-grey-600 bg-grey-50 rounded-lg">
              이번 달 남은 신규 시작이 없어요.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// 일정 1건을 한 줄 카드로 렌더 (마감/시작 섹션에서 공통 사용)
// - 마감(end): D-N 배지, 7일 이내면 빨강 강조
// - 시작(start): "오늘 시작" 또는 "N일 후" 초록 배지
// 섹션 헤더가 이미 시작/마감을 분류하므로 카드 내부에 별도 🆕/⏰ 칩은 두지 않음
// (중복 노이즈 제거 → 제목 가독성 ↑)
function renderEventRow(e: CalendarEvent, kstNow: Date, month0: number) {
  // e.date = "YYYY-MM-DD" 는 UTC 자정으로 파싱 → UTC 메서드로 일자 추출
  // dday 계산은 KST shift 한 kstNow 와 비교해야 한국 사용자 기준 정확 (예: KST 오전 5시
  // 기준 오늘 마감은 D-0 이어야 하는데, UTC now 로 계산하면 D-1 로 오답이 나올 수 있음)
  const eventDate = new Date(e.date);
  const day = eventDate.getUTCDate();
  const dday = Math.ceil(
    (eventDate.getTime() - kstNow.getTime()) / (1000 * 60 * 60 * 24),
  );

  let badgeClass: string;
  let badgeText: string;
  if (e.kind === "end") {
    if (dday <= 7) {
      badgeClass = "bg-[#FFEEEE] text-red";
    } else {
      badgeClass = "bg-blue-50 text-blue-600";
    }
    badgeText = `D-${dday}`;
  } else {
    badgeClass = "bg-green/10 text-green";
    badgeText = dday === 0 ? "오늘 시작" : `${dday}일 후`;
  }

  return (
    <a
      key={e.id}
      href={`/${e.type}/${e.programId}`}
      className="flex items-center gap-4 py-4 border-b border-grey-100 last:border-b-0 no-underline text-inherit hover:bg-grey-50 transition-colors"
    >
      <div className="shrink-0 w-12 text-center">
        <div className="text-[20px] font-bold text-grey-900">{day}</div>
        <div className="text-[11px] text-grey-600">{month0 + 1}월</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-grey-900 truncate mb-0.5">
          {e.title}
        </div>
        <div className="text-[13px] text-grey-600">{e.source}</div>
      </div>
      <div className="shrink-0">
        <span className={`text-[13px] font-bold px-2 py-1 rounded ${badgeClass}`}>
          {badgeText}
        </span>
      </div>
    </a>
  );
}
