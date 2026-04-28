// ============================================================
// 홈 회원가입 가치 카드 3종 (Value Props)
// ============================================================
// Hero 카피 바로 아래 inline chip 3종. 회원가입 망설임 해소:
//   - 무료 사용 (가격 부담 0)
//   - 마감 7일 전 자동 알림 (재방문 유도)
//   - 카카오톡 발송 (이메일 무시 사용자 대비)
//
// 발견 배경 (2026-04-28): 24h 가입 0건. 회원가입 가치가 명시되지 않으면
// 사용자가 "왜 가입해야 하지?" 라는 마찰 → 이탈. 3 chip 으로 즉시 해소.
// ============================================================

import { Check } from "lucide-react";

const PROPS = [
  { label: "무료 사용", desc: "100% 무료 · 광고로 운영" },
  { label: "마감 7일 전 알림", desc: "이메일 자동 발송" },
  { label: "카카오톡 발송", desc: "심사 통과 후 추가" },
];

export function HomeValueProps() {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-8 max-md:gap-1.5">
      {PROPS.map((p) => (
        <div
          key={p.label}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-blue-100 text-[13px] font-semibold text-grey-800 shadow-[0_1px_3px_rgba(49,130,246,0.06)]"
        >
          <Check className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
          <span>{p.label}</span>
          <span className="text-grey-500 font-normal hidden sm:inline">
            · {p.desc}
          </span>
        </div>
      ))}
    </div>
  );
}
