import { describe, expect, it } from "vitest";
import { EDITORIAL_NEWS } from "@/lib/editorial-news-data";
import { getNewsSnapshot, isNewsPublished, getPublishedNews } from "@/lib/editorial-news";

const article = EDITORIAL_NEWS[0];
const now = new Date("2026-10-06T00:00:00Z");
const approval = {
  snapshotSha256: getNewsSnapshot(article), reviewer: "운영자",
  reviewedAt: "2026-10-05T14:00:00Z", decision: "approved",
  originalValueConfirmed: true,
};

describe("정책뉴스 공개 검수", () => {
  it("초안은 승인 없이 공개하지 않는다", () => {
    expect(isNewsPublished(article, {}, now)).toBe(false);
  });
  it("실제 운영자 승인 기록과 현재 초안이 일치한다", () => {
    expect(getPublishedNews().map(item => item.slug)).toContain(article.slug);
  });
  it("현재 본문과 출처를 승인한 글만 공개한다", () => {
    expect(isNewsPublished(article, { [article.slug]: approval }, now)).toBe(true);
  });
  it("본문이나 출처가 바뀌면 과거 승인은 무효다", () => {
    const records = { [article.slug]: approval };
    expect(isNewsPublished({ ...article, answer: "바뀐 설명" }, records, now)).toBe(false);
    expect(isNewsPublished({ ...article, sourceUrl: "https://example.com" }, records, now)).toBe(false);
  });
  it("미래·잘못된 날짜와 비어 있는 검수자는 거부한다", () => {
    for (const change of [
      { reviewedAt: "2026-10-07T00:00:00Z" }, { reviewedAt: "잘못된 날짜" },
      { reviewer: " " }, { decision: "draft" }, { originalValueConfirmed: false },
    ]) expect(isNewsPublished(article, { [article.slug]: { ...approval, ...change } }, now)).toBe(false);
  });
  it("공식 출처가 아니거나 확인일이 미래면 승인해도 공개하지 않는다", () => {
    for (const change of [
      { sourceUrl: "https://korea.kr.example.com/news" }, { checkedAt: "2026-10-07" },
      { sourcePublishedAt: "2026-02-30" }, { updatedAt: "2026-10-08" },
    ]) {
      const changed = { ...article, ...change };
      expect(isNewsPublished(changed, { [article.slug]: { ...approval, snapshotSha256: getNewsSnapshot(changed) } }, now)).toBe(false);
    }
  });
});
