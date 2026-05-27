"use client";

import { useEffect, useRef, useState } from "react";

// 2026-05-21 — 위치별 slot/layout 분리 (#43).
// AdSense console 에서 위치별 ad unit 생성 후 해당 env 등록하면 자동 분기.
// env 미등록 위치는 기존 SLOT_INFEED + LAYOUT_INFEED fallback → 회귀 0.
const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;
const SLOT_DEFAULT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED;
const LAYOUT_DEFAULT = process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_INFEED;

// 위치별 slot ID 매핑 — env 미설정 시 default fallback.
// 'article' (5/27 추가): blog detail 본문 inline + news detail 본문 inline.
//   기존 'detail' 은 detail 끝 (본문 read 후). 'article' 은 본문 중/끝 inline (read flow).
const PLACEMENT_SLOTS: Record<AdPlacement, string | undefined> = {
  home: process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME,
  list: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LIST,
  detail: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DETAIL,
  category: process.env.NEXT_PUBLIC_ADSENSE_SLOT_CATEGORY,
  eligibility: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ELIGIBILITY,
  article: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE,
  default: undefined,
};
const PLACEMENT_LAYOUTS: Record<AdPlacement, string | undefined> = {
  home: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_HOME,
  list: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_LIST,
  detail: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_DETAIL,
  category: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_CATEGORY,
  eligibility: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_ELIGIBILITY,
  article: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_ARTICLE,
  default: undefined,
};

const EMPTY_SLOT_FALLBACK_MS = 15000;

type AdsByGoogle = Array<Record<string, unknown>>;
export type AdRenderState = "pending" | "filled" | "empty";

export type AdPlacement =
  | "home"
  | "list"
  | "detail"
  | "category"
  | "eligibility"
  | "article"
  | "default";

interface AdSlotProps {
  /**
   * AdSense ad-format.
   * - "fluid": in-feed (layout-key 필요)
   * - "auto": responsive banner
   */
  format?: "fluid" | "auto";
  /**
   * 광고 위치 — AdSense console 에서 위치별 ad unit 생성 후 해당 env 등록 시
   * 위치별 수익/CTR 분석 가능. env 미등록 시 default fallback.
   */
  placement?: AdPlacement;
}

export function getAdRenderState(node: Element): AdRenderState {
  const status = node.getAttribute("data-ad-status");
  if (status === "unfilled") return "empty";
  if (status === "filled" || node.querySelector("iframe")) return "filled";
  return "pending";
}

export function AdSlot({ format = "fluid", placement = "default" }: AdSlotProps) {
  const adRef = useRef<HTMLModElement | null>(null);
  const [renderState, setRenderState] = useState<AdRenderState>("pending");

  // placement 별 slot/layout 선택 + default fallback.
  const slotId = PLACEMENT_SLOTS[placement] ?? SLOT_DEFAULT;
  const layoutKey =
    format === "fluid"
      ? PLACEMENT_LAYOUTS[placement] ?? LAYOUT_DEFAULT
      : undefined;

  useEffect(() => {
    if (!PUBLISHER_ID || !slotId) return;
    if (typeof window === "undefined") return;

    let observer: MutationObserver | null = null;
    let fallbackTimer: number | null = null;

    const updateRenderState = () => {
      const node = adRef.current;
      if (!node) return;

      setRenderState(getAdRenderState(node));
    };

    try {
      const w = window as unknown as { adsbygoogle?: AdsByGoogle };
      w.adsbygoogle = w.adsbygoogle ?? [];
      w.adsbygoogle.push({});
    } catch (err) {
      console.warn("[AdSlot] adsbygoogle.push failed:", err);
      window.setTimeout(() => setRenderState("empty"), 0);
    }

    const node = adRef.current;
    if (node) {
      observer = new MutationObserver(updateRenderState);
      observer.observe(node, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    // AdsenseLazyLoader can wait 10s before loading on idle pages.
    // Keep the fallback later than that so valid ads are not collapsed early.
    fallbackTimer = window.setTimeout(() => {
      setRenderState((current) => (current === "pending" ? "empty" : current));
    }, EMPTY_SLOT_FALLBACK_MS);

    return () => {
      observer?.disconnect();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [slotId]);

  // 2026-05-18 AdSense 5/18 재거절 후속 — env 미설정 시 placeholder 노출 X.
  // AdSense 검수 봇이 빈 "광고" 박스를 "콘텐츠 없는 광고 슬롯" 으로 인식 risk.
  // 검수 통과 후 env 등록 → 자동으로 실제 광고 렌더링 재개.
  if (!PUBLISHER_ID || !slotId) {
    return null;
  }

  return (
    <div
      className={
        renderState === "empty"
          ? "hidden"
          : "max-w-content mx-auto px-6 lg:px-10 my-4"
      }
    >
      <ins
        ref={adRef}
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-format={format}
        data-ad-layout-key={layoutKey}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={slotId}
      />
    </div>
  );
}
