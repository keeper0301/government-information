// ============================================================
// 관리자 대시보드용 inline SVG sparkline (line chart)
// ============================================================
// 외부 패키지 없이 30일 시계열을 시각화. recharts/chart.js 같은 라이브러리
// 도입 비용을 피하면서 캡쳐의 "일별 추이" 차트 의도를 충족.
//
// 입력: { date: 'YYYY-MM-DD', value: number }[] — 시간순 정렬돼 있어야 함
// 출력: 가로 가득 채우는 SVG 라인 + X축 일자 5개 라벨 + Y축 max 값 라벨
// ============================================================

type Point = { date: string; value: number };

interface Props {
  data: Point[];
  /** 카드 안 SVG 영역 픽셀 높이 (모바일 대응 위해 fixed px) */
  height?: number;
  /** 라벨 단위 — '명' 또는 '원' */
  unit?: string;
  /** 곡선 색상 — Tailwind blue-500 / emerald-500 같은 hex */
  stroke?: string;
  /** 데이터가 없을 때 안내 문구 */
  emptyText?: string;
}

export function Sparkline({
  data,
  height = 180,
  unit = "",
  stroke = "#3182F6", // blue-500
  emptyText = "데이터가 없어요",
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[13px] text-grey-500"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  // SVG viewBox 좌표계 — 가로 1000 기준, 세로는 height 비율.
  // Tailwind preserveAspectRatio="none" 로 컨테이너 가로폭에 맞춰 stretch.
  const W = 1000;
  const H = 200;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 28;
  const PAD_LEFT = 36;
  const PAD_RIGHT = 8;

  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const max = Math.max(1, ...data.map((d) => d.value));

  // 점 좌표 계산 — X 는 데이터 인덱스 균등 분할
  const points = data.map((d, i) => {
    const x = PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = PAD_TOP + innerH - (d.value / max) * innerH;
    return { x, y, raw: d };
  });

  // SVG path d 속성
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // 면적 채움 (라인 아래 그라디언트) — 시각적 풍성함
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} Z`;

  // X축 라벨 5개 — 처음·끝 + 균등 분포
  const labelIdxs = pickLabelIdxs(data.length, 5);

  // gradient id — 같은 페이지에 sparkline 2개 이상 있을 때 충돌 방지.
  // stroke 색상 hex 의 # 제거 한 값을 키로 사용 — 색상별 그라디언트 분리.
  const gradId = `spark-grad-${stroke.replace("#", "")}`;

  // Y축 max 표시값 — 0 / max
  const formatMax = unit === "원" ? formatKrw(max) : `${max.toLocaleString()}${unit}`;

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full h-full"
        role="img"
        aria-label="일별 추이 차트"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y축 max + 0 라벨 */}
        <text x="4" y={PAD_TOP + 4} fontSize="11" fill="#6F6557">
          {formatMax}
        </text>
        <text x="4" y={PAD_TOP + innerH + 4} fontSize="11" fill="#6F6557">
          0
        </text>

        {/* 가로 grid 2줄 (0 / max) */}
        <line
          x1={PAD_LEFT}
          x2={W - PAD_RIGHT}
          y1={PAD_TOP}
          y2={PAD_TOP}
          stroke="#E5E0D5"
          strokeDasharray="2 4"
        />
        <line
          x1={PAD_LEFT}
          x2={W - PAD_RIGHT}
          y1={PAD_TOP + innerH}
          y2={PAD_TOP + innerH}
          stroke="#E5E0D5"
        />

        {/* 면적 채움 */}
        <path d={areaD} fill={`url(#${gradId})`} />
        {/* 라인 */}
        <path d={pathD} fill="none" stroke={stroke} strokeWidth="2" />

        {/* 점 — 데이터 < 31 개일 때만. 너무 많으면 노이즈 */}
        {data.length <= 31 &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2.5"
              fill="white"
              stroke={stroke}
              strokeWidth="1.5"
            >
              <title>
                {p.raw.date} · {unit === "원" ? formatKrw(p.raw.value) : `${p.raw.value}${unit}`}
              </title>
            </circle>
          ))}

        {/* X축 일자 라벨 — 5개 균등 분포, MM-DD */}
        {labelIdxs.map((idx) => {
          const p = points[idx];
          const label = data[idx].date.slice(5); // YYYY-MM-DD → MM-DD
          return (
            <text
              key={idx}
              x={p.x}
              y={H - 8}
              fontSize="11"
              fill="#6F6557"
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// 데이터 길이 N 에서 라벨 표시할 인덱스 K 개를 균등 추출 (양 끝 포함)
function pickLabelIdxs(n: number, k: number): number[] {
  if (n <= k) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    out.push(Math.round((i / (k - 1)) * (n - 1)));
  }
  return out;
}

// 한국 원 단위 천 단위 콤마 + 만/억 단위 — 차트 라벨 가독성.
// 1,000,000 → 100만, 12,345,000 → 1,234만 처럼 짧게.
function formatKrw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return `${n.toLocaleString()}원`;
}
