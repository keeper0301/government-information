// 활동 추세 막대그래프 — 14일 일별. 서버 렌더 SVG(차트 라이브러리 없음).
// 데이터 의존성 0(설치 없음), 정적 SVG 라 admin 페이지에서 가볍게 렌더.

import type { DayBucket } from "@/lib/autonomous-ops/overview-metrics";

export function ActivityChart({
  title,
  data,
  color = "#3b82f6",
  unit = "건",
}: {
  title: string;
  data: DayBucket[];
  color?: string;
  unit?: string;
}) {
  const W = 560;
  const H = 160;
  const padL = 8;
  const padR = 8;
  const padTop = 18;
  const padBottom = 22;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const gap = 4;
  const barW = (W - padL - padR - gap * (n - 1)) / n;
  const chartH = H - padTop - padBottom;
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = Math.round(total / n);

  return (
    <div className="border border-grey-200 rounded-xl p-4 bg-white">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[14px] font-bold text-grey-900">{title}</h3>
        <span className="text-[12px] text-grey-600">
          14일 합계 {total.toLocaleString()}{unit} · 일평균 {avg.toLocaleString()}{unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title} 14일 추세`}>
        {/* 최댓값 안내선 */}
        <line x1={padL} y1={padTop} x2={W - padR} y2={padTop} stroke="#e5e7eb" strokeWidth="1" />
        <text x={W - padR} y={padTop - 5} textAnchor="end" fontSize="10" fill="#9ca3af">{max.toLocaleString()}{unit}</text>
        {data.map((d, i) => {
          const h = (d.count / max) * chartH;
          const x = padL + i * (barW + gap);
          const y = padTop + (chartH - h);
          const isLast = i === n - 1;
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                rx={2}
                fill={isLast ? "#1d4ed8" : color}
                opacity={isLast ? 1 : 0.8}
              >
                <title>{`${d.day}: ${d.count.toLocaleString()}${unit}`}</title>
              </rect>
              {/* 막대 위 값(최근일만 표기로 잡음 ↓) */}
              {isLast && (
                <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1d4ed8">
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
        {/* x축 — 첫날·중간·마지막 라벨만(월-일) */}
        {[0, Math.floor(n / 2), n - 1].map((i) => {
          const x = padL + i * (barW + gap) + barW / 2;
          const md = data[i].day.slice(5);
          return (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="10" fill="#9ca3af">{md}</text>
          );
        })}
      </svg>
    </div>
  );
}
