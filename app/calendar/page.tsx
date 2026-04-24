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

// 주어진 (year, month0) 에서 delta 달만큼 이동한 결과를 1-based month 로 반환.
// delta=-1 → 이전 달, +1 → 다음 달. 연도 경계 자동 처리.
function shiftMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month0 + delta;
  const newYear = Math.floor(total / 12);
  const newMonth0 = ((total % 12) + 12) % 12; // 음수 delta 방어
  return { year: newYear, month: newMonth0 + 1 };
}

type SearchParams = { year?: string; month?: string };

// 월 이동 네비게이션 지원 — ?year=YYYY&month=M 쿼리로 다른 달 조회.
// 없으면 KST 기준 이번 달이 기본. 오늘 기준 ±24개월 바깥은 이번 달로 폴백.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // 한국 시간(KST, UTC+9) 기준으로 "오늘" 결정.
  // Vercel 기본 타임존이 UTC 라 그대로 쓰면 KST 00:00 ~ 09:00 창에서
  // 서버가 "어제"를 오늘로 판정 → 한국 사용자 달력과 하루 어긋남.
  // now.getTime() 에 9h 를 더해 가상 "KST 시점" 을 만든 뒤
  // UTC 메서드로 년·월·일을 뽑는 트릭 (외부 라이브러리 없이 처리).
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const todayYear = kstNow.getUTCFullYear();
  const todayMonth = kstNow.getUTCMonth(); // 0-indexed
  const todayDay = kstNow.getUTCDate();

  // 조회할 월 결정 — URL 쿼리 우선, 유효성 검사 통과 못하면 이번 달
  const parsedYear = params.year ? parseInt(params.year, 10) : NaN;
  const parsedMonth = params.month ? parseInt(params.month, 10) : NaN; // 1-based
  const hasValidParam =
    Number.isFinite(parsedYear) &&
    Number.isFinite(parsedMonth) &&
    parsedYear >= 2000 &&
    parsedYear <= 2100 &&
    parsedMonth >= 1 &&
    parsedMonth <= 12;

  let year = todayYear;
  let month = todayMonth;
  if (hasValidParam) {
    const candidateYear = parsedYear;
    const candidateMonth = parsedMonth - 1;
    // 오늘 기준 ±24개월 바깥은 이탈 방지 차원에서 이번 달로 폴백
    const monthsDiff =
      (candidateYear - todayYear) * 12 + (candidateMonth - todayMonth);
    if (monthsDiff >= -24 && monthsDiff <= 24) {
      year = candidateYear;
      month = candidateMonth;
    }
  }

  // 조회 월이 실제 "이번 달" 인지 (오늘 강조용)
  const isCurrentMonth = year === todayYear && month === todayMonth;
  // today 는 달력 그리드에서 "오늘" 셀 하이라이트에만 쓰임.
  // 조회 월이 이번 달이 아니면 매치되는 날이 없도록 0 (1~31 와 절대 매치 X).
  const today = isCurrentMonth ? todayDay : 0;

  // 월의 첫 요일·일수 — Date.UTC 로 생성해 서버 로컬 타임존 영향 제거
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const monthStart = formatYmd(year, month, 1);
  const monthEnd = formatYmd(year, month, daysInMonth);
  // todayStr 은 "오늘 이후" 필터링에 쓰이는 실제 오늘 날짜 (조회 월 무관)
  const todayStr = formatYmd(todayYear, todayMonth, todayDay);

  // 이전/다음 달 계산 (네비게이션 링크용) — 1-based month 로 반환 (URL 쿼리 형식과 동일)
  const prevMonth = shiftMonth(year, month, -1);
  const nextMonth = shiftMonth(year, month, +1);

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

  // day -> 이벤트 리스트 — 홈 preview 와 같은 UI (dot + 제목 + "+N")
  // e.date 는 "YYYY-MM-DD" 포맷 → new Date() 가 UTC 자정으로 파싱하므로
  // getUTCDate() 를 써야 서버 로컬 타임존 무관하게 일자를 정확히 추출.
  // 정렬 기준:
  //   1) 마감(end) 이 시작(start) 보다 먼저 — 액션 긴급도 우선
  //   2) 복지 → 대출 순 — 사용자가 복지를 먼저 스캔하는 경향
  // 셀에서는 상위 2건만 제목 표시, 나머지는 "+N"
  const dayItems: Record<number, CalendarEvent[]> = {};
  for (const e of events) {
    const day = new Date(e.date).getUTCDate();
    (dayItems[day] ||= []).push(e);
  }
  for (const k of Object.keys(dayItems)) {
    const day = Number(k);
    dayItems[day].sort((a, b) => {
      // 마감이 시작보다 먼저
      if (a.kind !== b.kind) return a.kind === "end" ? -1 : 1;
      // 복지가 대출보다 먼저
      if (a.type !== b.type) return a.type === "welfare" ? -1 : 1;
      return 0;
    });
  }

  // 그리드 6행 고정 — 달 바뀔 때마다 높이 튀는 것 방지
  const totalSlots = 42;
  const trailingSlots = totalSlots - firstDay - daysInMonth;

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

      {/* 월 네비게이션 — 홈 프리뷰와 같은 톤의 단순 헤더 + 좌우 화살표
          홈 `CalendarPreview` 의 제목 스타일(H2 26px tracking -0.8)을 그대로 가져와
          두 화면이 동일한 "신청 마감 달력" 정체성을 공유하게 한다. */}
      <nav
        className="flex items-center justify-between gap-3 mb-4"
        aria-label="달력 월 이동"
      >
        <a
          href={`/calendar?year=${prevMonth.year}&month=${prevMonth.month}`}
          aria-label={`이전 달 (${prevMonth.year}년 ${prevMonth.month}월)`}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-grey-600 hover:bg-grey-100 hover:text-burgundy transition-colors no-underline text-[14px]"
        >
          <span aria-hidden="true">◀</span>
        </a>

        <div className="flex-1 min-w-0 flex items-baseline justify-center gap-3 flex-wrap">
          <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900 leading-none">
            {year}년 {month + 1}월 신청 마감 달력
          </h2>
          <span className="text-[13px] text-grey-600">
            신규 {newCount}건 · 마감 {upcomingCount}건
          </span>
          {!isCurrentMonth && (
            <a
              href="/calendar"
              className="text-[13px] font-semibold text-burgundy no-underline hover:underline"
            >
              오늘로
            </a>
          )}
        </div>

        <a
          href={`/calendar?year=${nextMonth.year}&month=${nextMonth.month}`}
          aria-label={`다음 달 (${nextMonth.year}년 ${nextMonth.month}월)`}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-grey-600 hover:bg-grey-100 hover:text-burgundy transition-colors no-underline text-[14px]"
        >
          <span aria-hidden="true">▶</span>
        </a>
      </nav>

      {/* Calendar grid — 홈 `CalendarPreview` 와 동일한 매거진 톤
          · 흰 셀 + grey-200 hairline gap + rounded-xl 외곽
          · 요일 헤더: tracking-[3px] 11px bold grey-600 (small caps 느낌)
          · 숫자: editorial-num (EB Garamond italic) — 좌상단
          · 이벤트: dot + 제목(truncate) 최대 2건, 나머지 +N
          · 모바일: 제목 숨김 + 복지/대출 dot 2개만 센터
          · 시작 vs 마감: 채움 dot = 마감 / 빈 ring dot = 시작 (정보 보존) */}
      <div className="grid grid-cols-7 gap-px bg-grey-200 rounded-xl overflow-hidden border border-grey-200 mb-6">
        {/* 요일 헤더 */}
        {DAYS.map((d) => (
          <div
            key={d}
            className="bg-white py-3 text-center text-[11px] font-bold text-grey-600"
            style={{ letterSpacing: "3px" }}
          >
            {d}
          </div>
        ))}

        {/* 이전 달 꼬리 — 완전 빈 흰 셀 (홈 프리뷰 동일) */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div
            key={`e${i}`}
            className="bg-white min-h-[108px] max-md:min-h-[76px]"
            aria-hidden="true"
          />
        ))}

        {/* 이번 달 날짜 */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today;
          const items = dayItems[day];
          const hasEvents = !!items && items.length > 0;

          return (
            <div
              key={day}
              className={`relative p-2 min-h-[108px] max-md:min-h-[76px] overflow-hidden transition-colors ${
                isToday ? "bg-blue-50" : "bg-white"
              }`}
            >
              {/* 날짜 숫자 — editorial-num italic, 오늘은 굵고 크게 */}
              <div
                className={`editorial-num leading-none mb-2 ${
                  isToday
                    ? "text-burgundy font-bold text-[22px]"
                    : "text-grey-700 text-[17px]"
                }`}
              >
                {day}
              </div>

              {/* 이벤트 — dot + 제목 truncate (데스크톱), 모바일은 dot 모음 */}
              {hasEvents && (
                <div className="flex flex-col gap-[4px]">
                  {items.slice(0, 2).map((item) => {
                    const isWelfare = item.type === "welfare";
                    const baseColor = isWelfare ? "burgundy" : "#B87A2E";
                    return (
                      <a
                        key={item.id}
                        href={`/${item.type}/${item.programId}`}
                        className="flex items-start gap-1.5 no-underline group max-md:hidden"
                        title={`${item.title} — ${item.kind === "end" ? "마감" : "시작"}`}
                      >
                        {/* 마감 = 채움 / 시작 = 빈 ring */}
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
                            style={{
                              boxShadow: `inset 0 0 0 1.5px ${baseColor}`,
                            }}
                          />
                        )}
                        <span className="text-[11.5px] leading-[1.4] text-grey-800 group-hover:text-grey-900 font-medium truncate">
                          {shortenTitle(item.title)}
                        </span>
                      </a>
                    );
                  })}
                  {items.length > 2 && (
                    <div className="editorial-num text-[12px] text-grey-600 pl-[14px] max-md:hidden">
                      +{items.length - 2}
                    </div>
                  )}

                  {/* 모바일 — 카테고리별 dot 2개만 */}
                  <div className="hidden max-md:flex gap-1 justify-center mt-1">
                    {items.some((it) => it.type === "welfare") && (
                      <span
                        aria-hidden="true"
                        className="w-[6px] h-[6px] rounded-full bg-burgundy"
                      />
                    )}
                    {items.some((it) => it.type === "loan") && (
                      <span
                        aria-hidden="true"
                        className="w-[6px] h-[6px] rounded-full bg-[#B87A2E]"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 다음 달 머리 — 6행 고정을 위해 빈 흰 셀 채움 */}
        {Array.from({ length: Math.max(0, trailingSlots) }).map((_, i) => (
          <div
            key={`t${i}`}
            className="bg-white min-h-[108px] max-md:min-h-[76px]"
            aria-hidden="true"
          />
        ))}
      </div>

      {/* 범례 — 홈 preview 와 동일 톤 (● 복지·수혜 / ● 대출·지원금)
          시작/마감 구분은 추가로 한 줄 덧붙여서 정보 보존 */}
      <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-grey-600">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-[7px] h-[7px] rounded-full bg-burgundy"
          />
          <span>복지·수혜</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-[7px] h-[7px] rounded-full bg-[#B87A2E]"
          />
          <span>대출·지원금</span>
        </div>
        <span aria-hidden="true" className="hidden md:block w-px h-3 bg-grey-200" />
        <div className="flex items-center gap-1.5 text-grey-500 text-[12px]">
          <span
            aria-hidden="true"
            className="w-[7px] h-[7px] rounded-full bg-grey-600"
          />
          <span>마감</span>
          <span
            aria-hidden="true"
            className="ml-2 w-[7px] h-[7px] rounded-full bg-white"
            style={{ boxShadow: "inset 0 0 0 1.5px #6F6557" }}
          />
          <span>시작</span>
        </div>
      </div>

      {/* List — 신규 시작 / 마감 예정 두 섹션으로 분리 (가독성 ↑)
          순서 의도: 새 기회(발견 UX) 먼저 → 마감(긴급 UX) 뒤에.
          자연스러운 시간 흐름 (열림 → 마감) 과 일치하고, 마감 임박은
          이미 홈 AlertStrip 에서 별도로 강조되므로 여기선 뒤로 배치.
          각 섹션 내부는 날짜 오름차순. 과거·D-0 마감은 숨김 (액션 불가 정보). */}
      <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900 mb-6">
        {monthName} 일정
      </h2>

      <div className="space-y-10">
        {/* 🆕 신규 시작 섹션 (먼저 — 발견 UX) */}
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
            <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
              {upcomingStarts.map((e) => renderEventRow(e, kstNow, month))}
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-grey-600 bg-white border border-grey-200 rounded-2xl">
              이번 달 남은 신규 시작이 없어요.
            </div>
          )}
        </section>

        {/* ⏰ 마감 예정 섹션 (뒤에 — 긴급 UX, AlertStrip 과 중복 완화) */}
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
            <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
              {upcomingEndings.map((e) => renderEventRow(e, kstNow, month))}
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-grey-600 bg-white border border-grey-200 rounded-2xl">
              이번 달 남은 마감 예정이 없어요.
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

// 달력 셀에 제목을 짧게 표시하기 위한 헬퍼 — 홈 CalendarPreview 와 동일 규칙.
// 예: "2026년 청년 월세 특별지원" → "청년 월세 특별지원"
//     "「2026년도」 창업" → "창업"
// 제목 앞의 연도/괄호를 제거해서 좁은 셀에서도 사업명이 먼저 눈에 들어오게 한다.
function shortenTitle(title: string): string {
  return title
    .replace(/^\d{4}년도?\s*/g, "")
    .replace(/^「|」/g, "")
    .trim();
}
