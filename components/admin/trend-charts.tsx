// components/admin/trend-charts.tsx
// Phase 6 — /admin/health 의 30일 추세 SVG 차트.
// 라이브러리 신규 X, 단순 SVG bar/line — 가벼움 (Phase 1 성능 보존).

import type { DailyPoint } from "@/lib/admin-trends";

// ============================================================
// SimpleBarChart — 단일 또는 다중 시리즈 bar
// ============================================================
type BarSeries = {
  label: string;
  color: string; // hex (#3182F6 등) 또는 css color
  data: DailyPoint[];
};

export function SimpleBarChart({
  title,
  series,
}: {
  title: string;
  series: BarSeries[];
}) {
  if (series.length === 0 || series[0].data.length === 0) {
    return (
      <div className="text-[12px] text-grey-500">
        데이터 없음 (30일 모두 0)
      </div>
    );
  }
  const days = series[0].data.length;
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.data.map((d) => d.value)),
  );
  const barWidth = 100 / days;
  const chartHeight = 80;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-grey-800">{title}</h3>
        <div className="flex gap-3 text-[11px] text-grey-600">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 100 ${chartHeight}`}
        className="w-full h-20 bg-grey-50 rounded"
        preserveAspectRatio="none"
      >
        {series.map((s, sIdx) =>
          s.data.map((d, i) => (
            <rect
              key={`${sIdx}-${d.date}`}
              x={i * barWidth + sIdx * (barWidth / series.length)}
              y={chartHeight - (d.value / max) * chartHeight}
              width={Math.max(0.1, barWidth / series.length - 0.2)}
              height={(d.value / max) * chartHeight}
              fill={s.color}
            />
          )),
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-grey-500 mt-1">
        <span>{series[0].data[0]?.date.slice(5)}</span>
        <span>최대 {max.toLocaleString()}</span>
        <span>{series[0].data[series[0].data.length - 1]?.date.slice(5)}</span>
      </div>
    </section>
  );
}

// ============================================================
// SimpleLineChart — 단일 series line (DAU 용)
// ============================================================
export function SimpleLineChart({
  title,
  data,
  color = "#3182F6",
}: {
  title: string;
  data: DailyPoint[];
  color?: string;
}) {
  if (data.length === 0) {
    return <div className="text-[12px] text-grey-500">데이터 없음</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const chartHeight = 80;
  const points = data
    .map((d, i) => {
      const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
      const y = chartHeight - (d.value / max) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-grey-800">{title}</h3>
        <span className="text-[11px] text-grey-600">최대 {max}</span>
      </div>
      <svg
        viewBox={`0 0 100 ${chartHeight}`}
        className="w-full h-20 bg-grey-50 rounded"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-grey-500 mt-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </section>
  );
}
