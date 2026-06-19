"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { shouldTrackAnalyticsPath } from "@/lib/analytics";

function shouldLoadGoogleAnalytics(pathname: string | null): boolean {
  if (!pathname) return false;
  return shouldTrackAnalyticsPath(
    pathname,
    typeof window === "undefined" ? "" : window.location.search,
  );
}

export function ConditionalGoogleAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(shouldLoadGoogleAnalytics(pathname));
  }, [pathname]);

  if (!enabled) return null;
  return <GoogleAnalytics gaId={gaId} />;
}

export { shouldLoadGoogleAnalytics };
