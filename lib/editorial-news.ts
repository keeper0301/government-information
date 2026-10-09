import { createHash } from "node:crypto";
import records from "@/data/news-owner-reviews.json";
import { EDITORIAL_NEWS, type EditorialNews } from "@/lib/editorial-news-data";

export interface NewsOwnerReview {
  snapshotSha256: string;
  reviewer: string;
  reviewedAt: string;
  publishedAt?: string;
  decision: string;
  originalValueConfirmed: boolean;
}

// 출처나 본문이 바뀌면 승인을 무효로 하기 위해 기사 전체를 대조합니다.
export function getNewsSnapshot(article: EditorialNews) {
  return createHash("sha256").update(JSON.stringify(article)).digest("hex");
}

function validDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === day;
}

export function isNewsPublished(
  article: EditorialNews,
  reviews: Record<string, NewsOwnerReview> = records,
  now = new Date(),
) {
  const review = Object.hasOwn(reviews, article.slug) ? reviews[article.slug] : undefined;
  if (!review || review.decision !== "approved" || !review.reviewer?.trim()
    || review.originalValueConfirmed !== true || review.snapshotSha256 !== getNewsSnapshot(article)) return false;
  const reviewed = new Date(review.reviewedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(review.reviewedAt)
    || !Number.isFinite(reviewed.getTime()) || reviewed.toISOString().replace(".000Z", "Z") !== review.reviewedAt.replace(".000Z", "Z")
    || reviewed > now) return false;
  const reviewDay = review.reviewedAt.slice(0, 10);
  // 최초 발행일은 갱신 확인일보다 늦거나 원문 발표일보다 빠를 수 없습니다.
  if (review.publishedAt) {
    const published = new Date(review.publishedAt);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(review.publishedAt)
      || !Number.isFinite(published.getTime())
      || published.toISOString().replace('.000Z', 'Z') !== review.publishedAt.replace('.000Z', 'Z')
      || published > reviewed || review.publishedAt.slice(0, 10) < article.sourcePublishedAt) return false;
  }
  if (![article.sourcePublishedAt, article.checkedAt, article.updatedAt].every(validDay)
    || article.sourcePublishedAt > article.checkedAt || article.checkedAt > reviewDay
    || article.updatedAt > reviewDay) return false;
  try {
    const source = new URL(article.sourceUrl);
    return source.protocol === "https:" && source.hostname === "www.korea.kr"
      && !!article.question.trim() && !!article.answer.trim() && article.sections.length >= 3;
  } catch { return false; }
}

export function getPublishedNews() {
  return EDITORIAL_NEWS.filter(article => isNewsPublished(article));
}

export function getPublishedNewsBySlug(slug: string) {
  return getPublishedNews().find(article => article.slug === slug);
}

export function getPublishedNewsReview(article: EditorialNews): NewsOwnerReview | undefined {
  return isNewsPublished(article) ? (records as Record<string, NewsOwnerReview>)[article.slug] : undefined;
}
