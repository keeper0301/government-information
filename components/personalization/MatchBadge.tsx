// components/personalization/MatchBadge.tsx
// 전체 리스트에서 사용자 조건에 맞는 항목에 표시하는 ✨ 배지 (한 줄, 작게)
// props 없는 순수 표시 전용 컴포넌트 — 어느 카드에나 붙일 수 있음

export function MatchBadge() {
  return (
    // 연두색 배경의 작은 인라인 배지
    // text-[10px]: 아주 작은 글씨 (카드 본문보다 눈에 띄지 않게)
    // leading-none: 줄 높이 1로 고정해 배지가 딱 맞게 크기 조정됨
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 leading-none">
      ✨ 내 조건
    </span>
  );
}
