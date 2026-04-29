// ============================================================
// UpgradeCta — 무료/베이직 사용자 대상 업그레이드 권유 카드
// ============================================================
// Free → Basic, Basic → Pro 한 단계 위 티어를 권유.
// Pro 사용자에겐 절대 노출하지 말 것 (props 타입에서 'pro' 제외).
// source 파라미터로 어느 페이지에서 클릭됐는지 GA4·UTM 로 추적.
//
// 클릭 시:
//   - /pricing 으로 이동 (?from=<source> 쿼리 부착 → GA·서버 로그에서 출처 분리)
//   - 클라이언트에서 trackEvent("upgrade_cta_clicked") 발사
// ============================================================

"use client";

import Link from "next/link";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { TierBadge } from "./tier-badge";

// CTA 가 노출 가능한 출처 — analytics 이벤트 source 파라미터로 그대로 전달
type CtaSource = "mypage" | "notifications" | "search" | "alerts";

export function UpgradeCta({
  currentTier,
  source,
}: {
  // pro 사용자는 노출 X. 타입으로 강제해 컴파일 타임에 잘못된 사용 방지.
  currentTier: "free" | "basic";
  source: CtaSource;
}) {
  // 한 단계 위 타깃 — free → basic, basic → pro
  const targetTier: "basic" | "pro" =
    currentTier === "free" ? "basic" : "pro";

  // 메시지 — 사장님 wedge 강조 (basic) → AI 무제한 강조 (pro)
  const message =
    currentTier === "free"
      ? "🏪 사장님 자격 자동 진단 + 카톡 알림 받으려면"
      : "✨ AI 상담 무제한 + 신청서 초안 작성하려면";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 my-4">
      <p className="text-sm text-amber-900 mb-3 leading-[1.6]">{message}</p>
      <Link
        href={`/pricing?from=${source}`}
        onClick={() => {
          // GA4 funnel — 어느 페이지의 CTA 가 가장 전환되는지 측정
          trackEvent(EVENTS.UPGRADE_CTA_CLICKED, {
            source,
            current_tier: currentTier,
            target_tier: targetTier,
          });
        }}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold no-underline hover:bg-amber-600 transition-colors"
      >
        <TierBadge tier={targetTier} /> 업그레이드 →
      </Link>
    </div>
  );
}
