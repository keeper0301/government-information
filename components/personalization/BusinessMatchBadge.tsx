// components/personalization/BusinessMatchBadge.tsx
// 자영업자 자격 진단 배지 (Basic wedge 의 시각적 구현).
//
// lib/eligibility/business-match.ts 의 BusinessMatch 결과를 카드에 노출:
//   - match    : "사장님 자격 ✓" 녹색 — 신청 가능 즉시 인지
//   - mismatch : "자격 미해당" 회색 — 자격 안 됨 명시 (분리 섹션엔 score 0 으로 노출 X)
//   - unknown  : 표시 안 함 (정보 부족, noise 줄임)
//   - null     : 사용자가 business profile 미입력 — 표시 안 함

import type { BusinessMatch } from '@/lib/eligibility/business-match';

export function BusinessMatchBadge({
  match,
}: {
  match: BusinessMatch | null;
}) {
  if (match === null || match === 'unknown') return null;

  if (match === 'match') {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 leading-none"
        title="사장님 가게 정보로 자동 매칭된 자격 충족 정책"
      >
        ✓ 사장님 자격
      </span>
    );
  }

  // mismatch
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-grey-600 bg-grey-100 border border-grey-200 rounded px-1.5 py-0.5 leading-none"
      title="등록한 가게 정보 기준 자격 미해당. 정보 변동 시 마이페이지 갱신"
    >
      자격 미해당
    </span>
  );
}
