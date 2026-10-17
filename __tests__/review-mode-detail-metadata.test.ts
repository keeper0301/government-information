import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => {
    const query = { select: () => query, eq: () => query, not: () => query,
      maybeSingle: async () => ({ data: {
        title: '정책 안내', content: '본문', meta_description: '신청 안내',
        tags: [], faqs: [], category: null, cover_image: null,
        published_at: '2026-01-01', admin_review_required: false,
        admin_reviewed_at: null, admin_review_score: null,
      } }),
    };
    return query;
  } }),
}));

vi.mock('@/components/ga-page-tracker', () => ({ GaPageTracker: () => null }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('review-mode detail metadata matches curated sitemap policy', () => {
  it.each([undefined, 'approved-after-review', 'adsense-approved-live-ads'])('aligns the entire eligibility route family without changing content (%s)', async value => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', value);
    vi.resetModules();
    const { metadata, default: Layout } = await import('@/app/eligibility/layout');
    expect(metadata.robots).toEqual(value === 'adsense-approved-live-ads' ? undefined : { index: false, follow: true });
    const child = 'existing route content';
    expect(Layout({ children: child })).toBe(child);
  });
  it.each([undefined, 'approved-after-review'])('keeps blog detail noindex in review mode (%s)', async value => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', value);
    vi.resetModules();
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'policy-guide' }) });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/blog/policy-guide');
  });
  it('preserves normal-mode blog indexing and canonical', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', 'adsense-approved-live-ads');
    vi.resetModules();
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'policy-guide' }) });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe('/blog/policy-guide');
  });
  it.each([undefined, 'approved-after-review'])('keeps eligibility detail noindex in review mode (%s)', async value => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', value);
    vi.resetModules();
    const { generateMetadata } = await import('@/app/eligibility/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'low-income' }) });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('https://www.keepioo.com/eligibility/low-income');
  });
  it('preserves normal-mode eligibility indexing and canonical', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', 'adsense-approved-live-ads');
    vi.resetModules();
    const { generateMetadata } = await import('@/app/eligibility/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'low-income' }) });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe('https://www.keepioo.com/eligibility/low-income');
  });
});
