import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ reviews: {} as Record<string, unknown>, post: { slug: 'policy-guide', title: '정책 안내', content: '공식 원문 대조 설명', meta_description: '신청 안내', faqs: [], published_at: '2026-01-01', tags: [], cover_image: null } }));
vi.mock('@/lib/blog-search-reviews.json', () => ({ default: state.reviews }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ not: () => ({
      maybeSingle: async () => ({ data: state.post }),
    }) }) }) }),
  }),
}));

vi.mock('@/components/ga-page-tracker', () => ({ GaPageTracker: () => null }));

afterEach(() => { for (const key of Object.keys(state.reviews)) delete state.reviews[key]; vi.unstubAllEnvs(); vi.resetModules(); });

describe('review-mode detail metadata matches curated sitemap policy', () => {
  it.each([undefined, 'approved-after-review', 'adsense-approved-live-ads'])('aligns the entire eligibility route family without changing content (%s)', async value => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', value);
    vi.resetModules();
    const { metadata, default: Layout } = await import('@/app/eligibility/layout');
    expect(metadata.robots).toEqual({ index: false, follow: true });
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
  it('광고 승인 후에도 미검수 블로그는 검색 제외하고 대표 주소는 유지한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', 'adsense-approved-live-ads');
    vi.resetModules();
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'policy-guide' }) });
    expect(metadata.robots).toEqual({ index: false, follow: true });
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
  it('광고 승인 후에도 자격별 목록은 검색 제외하고 대표 주소는 유지한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', 'adsense-approved-live-ads');
    vi.resetModules();
    const { generateMetadata } = await import('@/app/eligibility/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'low-income' }) });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('https://www.keepioo.com/eligibility/low-income');
  });
});

 it.each(['on', 'adsense-approved-live-ads'])('검수된 블로그는 광고 설정과 무관하게 검색 허용한다: %s', async value => {
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_REVIEW_MODE', value);
  vi.resetModules();
  const { blogSearchSnapshot } = await import('@/lib/search-publication');
  state.reviews[state.post.slug] = { snapshot: blogSearchSnapshot(state.post), checkedAt: '2026-01-02' };
  const { generateMetadata } = await import('@/app/blog/[slug]/page');
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: state.post.slug }) });
  expect(metadata.robots).toEqual({ index: true, follow: true });
  expect(metadata.alternates?.canonical).toBe('/blog/policy-guide');
});
