// 자율운영 흐름도 — 진단·실행(오케스트레이터) → 수집→분류→발행→인스타 파이프라인 +
// 감시·학습·푸시(횡단). 각 노드는 라이브 상태 색상(녹/황/적) 반영. 서버 렌더 SVG.

import type { SystemStatus } from "@/lib/autonomous-ops/overview-metrics";

const FILL: Record<SystemStatus["state"], string> = {
  green: "#dcfce7",
  yellow: "#fef9c3",
  red: "#fee2e2",
};
const STROKE: Record<SystemStatus["state"], string> = {
  green: "#16a34a",
  yellow: "#ca8a04",
  red: "#dc2626",
};

export function FlowDiagram({ systems }: { systems: SystemStatus[] }) {
  const by = new Map(systems.map((s) => [s.key, s]));
  const node = (key: string, x: number, y: number, w: number, h: number) => {
    const s = by.get(key);
    const state = s?.state ?? "green";
    return (
      <g key={key}>
        <rect x={x} y={y} width={w} height={h} rx={8} fill={FILL[state]} stroke={STROKE[state]} strokeWidth={1.5} />
        <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">
          {s?.label ?? key}
        </text>
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize="10" fill="#6b7280">
          {s ? `24h ${s.count24h}회` : ""}
        </text>
      </g>
    );
  };
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth={2} markerEnd="url(#arrow)" />
  );

  return (
    <div className="border border-grey-200 rounded-xl p-4 bg-white overflow-x-auto">
      <h3 className="text-[14px] font-bold text-grey-900 mb-2">자율운영 흐름 (노드 색 = 현재 상태)</h3>
      <svg viewBox="0 0 720 300" className="w-full h-auto min-w-[600px]" role="img" aria-label="자율운영 파이프라인 흐름도">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#9ca3af" />
          </marker>
        </defs>

        {/* 오케스트레이터 — 상단 전폭 */}
        {node("agent", 40, 16, 640, 46)}
        {/* 진단·실행 → 파이프라인으로 내려가는 화살표 */}
        {arrow(360, 62, 360, 92)}

        {/* 메인 파이프라인 (수집→분류→발행→인스타) */}
        {node("collect", 20, 96, 150, 56)}
        {arrow(170, 124, 192, 124)}
        {node("classify", 192, 96, 150, 56)}
        {arrow(342, 124, 364, 124)}
        {node("publish", 364, 96, 150, 56)}
        {arrow(514, 124, 536, 124)}
        {node("instagram", 536, 96, 160, 56)}

        {/* 횡단 — 감시·학습·푸시 (하단) */}
        {arrow(95, 152, 95, 222)}
        {node("monitor", 20, 226, 200, 52)}
        {node("learn", 260, 226, 200, 52)}
        {node("push", 500, 226, 196, 52)}
        {/* 발행→푸시 점선(알림 전달) */}
        <line x1={460} y1={152} x2={598} y2={222} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 3" />
      </svg>
      <p className="text-[11px] text-grey-500 mt-1">
        진단·실행이 전체를 감독하고, 수집→분류→발행 파이프라인이 콘텐츠를 만들며, 감시·학습·푸시가 횡단으로 작동합니다.
      </p>
    </div>
  );
}
