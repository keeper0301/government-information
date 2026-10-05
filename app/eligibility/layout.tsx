import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { reviewModeNoindexRobots } from '@/lib/adsense-review-mode';

// Index, single-category and cross-category templates share the curated
// review-mode sitemap exclusion. Children retain their own canonical URLs.
export const metadata: Metadata = {
  robots: reviewModeNoindexRobots(),
};

export default function EligibilityLayout({ children }: { children: ReactNode }) {
  return children;
}
