// 자율운영 상태판 — 시스템별 색상 타일(녹/황/적) + 최근 발화·24h 카운트.
// 서버 컴포넌트(데이터는 page 에서 fetch). 한눈에 전체 자율운영 건강 파악.

import type { SystemStatus } from "@/lib/autonomous-ops/overview-metrics";

const STATE_STYLE: Record<SystemStatus["state"], { bg: string; dot: string; label: string }> = {
  green: { bg: "bg-green-50 border-green-200", dot: "bg-green-500", label: "정상" },
  yellow: { bg: "bg-yellow-50 border-yellow-300", dot: "bg-yellow-500", label: "주의" },
  red: { bg: "bg-red-50 border-red-300", dot: "bg-red-500", label: "점검" },
};

function fmtAgo(hoursAgo: number | null): string {
  if (hoursAgo === null) return "발화 기록 없음";
  if (hoursAgo < 1) return `${Math.round(hoursAgo * 60)}분 전`;
  if (hoursAgo < 48) return `${Math.round(hoursAgo)}시간 전`;
  return `${Math.round(hoursAgo / 24)}일 전`;
}

export function StatusBoard({ systems }: { systems: SystemStatus[] }) {
  const reds = systems.filter((s) => s.state === "red").length;
  const yellows = systems.filter((s) => s.state === "yellow").length;
  const overall = reds > 0 ? "점검 필요" : yellows > 0 ? "주의" : "전체 정상";
  const overallColor = reds > 0 ? "text-red" : yellows > 0 ? "text-yellow-700" : "text-green-700";

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-[18px] font-bold text-grey-900">한눈에 보는 자율운영 상태</h2>
        <span className={`text-[14px] font-bold ${overallColor}`}>
          ● {overall} <span className="font-normal text-grey-600">(정상 {systems.length - reds - yellows} · 주의 {yellows} · 점검 {reds})</span>
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {systems.map((s) => {
          const st = STATE_STYLE[s.state];
          return (
            <div key={s.key} className={`border rounded-xl p-4 ${st.bg}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} aria-hidden />
                <span className="text-[14px] font-bold text-grey-900">{s.label}</span>
              </div>
              <div className="text-[12px] text-grey-700">최근 {fmtAgo(s.hoursAgo)}</div>
              <div className="text-[12px] text-grey-600 mt-0.5">24시간 {s.count24h.toLocaleString()}회 · {st.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
