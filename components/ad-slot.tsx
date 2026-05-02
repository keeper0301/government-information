"use client";

import { useEffect, useRef, useState } from "react";

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;
const SLOT_INFEED = process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED;
const LAYOUT_INFEED = process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_INFEED;
const EMPTY_SLOT_FALLBACK_MS = 15000;

type AdsByGoogle = Array<Record<string, unknown>>;
export type AdRenderState = "pending" | "filled" | "empty";

interface AdSlotProps {
  /**
   * AdSense ad-format.
   * - "fluid": in-feed
   * - "auto": responsive banner
   */
  format?: "fluid" | "auto";
}

export function getAdRenderState(node: Element): AdRenderState {
  const status = node.getAttribute("data-ad-status");
  if (status === "unfilled") return "empty";
  if (status === "filled" || node.querySelector("iframe")) return "filled";
  return "pending";
}

export function AdSlot({ format = "fluid" }: AdSlotProps) {
  const adRef = useRef<HTMLModElement | null>(null);
  const [renderState, setRenderState] = useState<AdRenderState>("pending");

  useEffect(() => {
    if (!PUBLISHER_ID || !SLOT_INFEED) return;
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
  }, []);

  if (!PUBLISHER_ID || !SLOT_INFEED) {
    return (
      <div className="max-w-content mx-auto px-10 max-md:px-6">
        <div className="border-t border-b border-grey-100 py-4 text-center text-xs text-grey-500">
          광고
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        renderState === "empty"
          ? "hidden"
          : "max-w-content mx-auto px-10 max-md:px-6 my-4"
      }
    >
      <ins
        ref={adRef}
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-format={format}
        data-ad-layout-key={LAYOUT_INFEED}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={SLOT_INFEED}
      />
    </div>
  );
}
