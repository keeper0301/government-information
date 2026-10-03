import { describe, expect, it } from "vitest";
import { contentEligibility, type ContentQuality } from "@/lib/content-quality";
import { getGuideEvidence, guideCategorySlugs } from "@/lib/guide-evidence";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
const ready: ContentQuality = { status: "published", sourcesVerified: true, originalValue: true, ownerReviewed: true, nonempty: true, indexEligible: true };
describe("persistent content-quality boundary", () => {
  it("allows only individually reviewed content after account approval", () => {
    expect(contentEligibility('/guides/example', ready, { reviewMode: false }).adEligible).toBe(true);
    expect(contentEligibility('/guides/example', ready, { reviewMode: true }).adEligible).toBe(false);
  });
  for (const path of ['/login', '/admin/foo', '/checkout', '/search', '/mypage', '/profile', '/payment', '/thank-you', '/api/test']) it(`denies ${path}`, () => expect(contentEligibility(path, ready, { reviewMode: false }).adEligible).toBe(false));
  for (const status of ['draft', 'source-checked', 'refresh-needed', 'closed', 'merged'] as const) it(`denies ${status}`, () => expect(contentEligibility('/guides/example', { ...ready, status }, { reviewMode: false }).adEligible).toBe(false));
  it('denies unreviewed, empty, missing-source and duplicated content', () => {
    for (const field of ['ownerReviewed', 'nonempty', 'sourcesVerified', 'originalValue'] as const) expect(contentEligibility('/guides/example', { ...ready, [field]: false }, { reviewMode: false }).adEligible).toBe(false);
    expect(contentEligibility('/guides/example', undefined, { reviewMode: false }).adEligible).toBe(false);
  });
  it('denies error, DB failure and filtered surfaces without inventing noindex', () => {
    for (const options of [{ httpStatus: 404 }, { httpStatus: 500 }, { databaseFailed: true }, { filtered: true }]) expect(contentEligibility('/guides/example', ready, { ...options, reviewMode: false }).adEligible).toBe(false);
    expect(contentEligibility('/guides/example', { ...ready, ownerReviewed: false }, { reviewMode: false }).indexEligible).toBe(true);
  });
});
describe('version-bound source evidence', () => {
  it('binds all three pilot bodies but never silently blesses changed DB content', () => {
    const pilots = EDITORIAL_GUIDES.filter(g => getGuideEvidence(g));
    expect(pilots).toHaveLength(3);
    for (const guide of pilots) {
      expect(getGuideEvidence({ ...guide, posts: ['different database content'] })).toBeUndefined();
      const original = guide.posts[0];
      try {
        guide.posts[0] = original + ' unreviewed local change';
        expect(getGuideEvidence(guide)).toBeUndefined();
      } finally { guide.posts[0] = original; }
      expect(getGuideEvidence(guide)).toBeDefined();
      expect(getGuideEvidence(guide)?.ownerReviewed).toBe(false);
    }
  });
  it('does not curate youth rent into business and never presents the closed 2026 round as open', () => {
    const rent = EDITORIAL_GUIDES.find(g => g.slug === 'youth-rent-checklist-2026')!;
    expect(guideCategorySlugs(rent)).not.toContain('business');
    expect(getGuideEvidence(rent)?.status).toBe('closed');
    expect(rent.posts.join(' ')).toContain('마감됐습니다');
    expect(getGuideEvidence(rent)?.sources.some(source => source.url.includes('id=95091798'))).toBe(true);
    expect(rent.updatedAt).toBe('2026-10-04');
  });
  it('treats inherited-object slugs as unknown rather than editorial evidence', () => {
    for (const slug of ['__proto__', 'constructor', 'toString']) {
      expect(guideCategorySlugs({ slug, title: 'unrelated content', programType: 'welfare' })).toEqual([]);
      expect(getGuideEvidence({ slug, title: 'unrelated content', posts: [] })).toBeUndefined();
    }
  });
  it('does not manufacture legacy fallback publication dates', () => {
    expect(EDITORIAL_GUIDES.every(g => !g.publishedAt)).toBe(true);
  });
});
