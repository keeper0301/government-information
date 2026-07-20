"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  captureTrafficAttribution,
  EVENTS,
  getPageCategory,
  shouldTrackAnalyticsPath,
  trackEvent,
  type AnalyticsParams,
} from "@/lib/analytics";

function parseDatasetParams(raw: string | undefined): AnalyticsParams {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const params: AnalyticsParams = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        params[key] = value;
      }
    }
    return params;
  } catch {
    return {};
  }
}

function getClickTarget(event: MouseEvent): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-ga-event]");
}

export function Ga4ConversionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    if (!pathname) return;
    const query = search ? `?${search}` : "";
    if (!shouldTrackAnalyticsPath(pathname, query)) return;

    const attribution = captureTrafficAttribution();
    trackEvent(EVENTS.SITE_PAGE_VIEWED, {
      page_path: `${pathname}${query}`.slice(0, 180),
      page_category: getPageCategory(pathname),
    });

    if (Object.keys(attribution).length > 0) {
      trackEvent(EVENTS.TRAFFIC_ATTRIBUTION_CAPTURED, {
        page_path: pathname,
        page_category: getPageCategory(pathname),
      });
    }
  }, [pathname, search]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const element = getClickTarget(event);
      if (!element) return;
      const eventName = element.dataset.gaEvent || EVENTS.CTA_CLICKED;
      const params = parseDatasetParams(element.dataset.gaParams);
      trackEvent(eventName, {
        ...params,
        cta_label: element.dataset.gaLabel ?? element.textContent?.trim().slice(0, 80) ?? "unknown",
        cta_location: element.dataset.gaLocation ?? "unknown",
        cta_href: element instanceof HTMLAnchorElement ? element.href : undefined,
      });
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
