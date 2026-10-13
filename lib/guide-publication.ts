import { createHash } from "node:crypto";
import type { PolicyGuide } from "@/lib/policy-guides";
import { getGuideEvidence, type GuideEvidence } from "@/lib/guide-evidence";
import reviewRecords from "@/data/guide-owner-reviews.json";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";

export interface GuideOwnerReview {
  snapshotSha256: string;
  reviewer: string;
  reviewedAt: string;
  // 저장 파일에서 읽은 문자열은 아래의 승인 조건으로 다시 확인합니다.
  decision: string;
  originalValueConfirmed: boolean;
}

// 본문뿐 아니라 출처·조건 표까지 함께 묶어 승인 이후 변경을 알아냅니다.
export function getGuideReviewSnapshot(guide: PolicyGuide, evidence: GuideEvidence): string {
  return createHash("sha256").update(JSON.stringify({
    slug: guide.slug, title: guide.title, posts: guide.posts, evidence,
  })).digest("hex");
}

export function getGuidePublication(
  guide: PolicyGuide,
  records: Record<string, GuideOwnerReview> = reviewRecords,
  now = new Date(),
) {
  const evidence = getGuideEvidence(guide);
  const review = Object.prototype.hasOwnProperty.call(records, guide.slug) ? records[guide.slug] : undefined;
  const reviewedDate = typeof review?.reviewedAt === "string" ? new Date(review.reviewedAt) : null;
  // 날짜를 자동 보정하거나 미래의 검수 기록을 승인으로 받아들이지 않습니다.
  const validDate = reviewedDate && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(review!.reviewedAt)
    && Number.isFinite(reviewedDate.getTime()) && reviewedDate.getTime() <= now.getTime()
    && reviewedDate.toISOString().slice(0, 10) === review!.reviewedAt.slice(0, 10);
  const sourcesReady = evidence && evidence.sources.length > 0 && evidence.sources.every(source => {
    try {
      return new URL(source.url).protocol === "https:" && /^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)
        && new Date(`${source.checkedAt}T00:00:00Z`).toISOString().slice(0, 10) === source.checkedAt
        && source.checkedAt <= (review?.reviewedAt ?? "").slice(0, 10);
    } catch { return false; }
  });
  // 새 본문을 과거 검수일로 승인한 것처럼 기록하지 못하게 수정일도 대조합니다.
  let updatedBeforeReview = false;
  if (evidence && review) {
    try {
      updatedBeforeReview = /^\d{4}-\d{2}-\d{2}$/.test(evidence.actualUpdatedAt)
        && new Date(`${evidence.actualUpdatedAt}T00:00:00Z`).toISOString().slice(0, 10) === evidence.actualUpdatedAt
        && evidence.actualUpdatedAt <= review.reviewedAt.slice(0, 10);
    } catch { updatedBeforeReview = false; }
  }
  const published = !!(evidence && review && validDate && sourcesReady && updatedBeforeReview
    && ["source-checked", "owner-reviewed", "published", "closed"].includes(evidence.status)
    && review.decision === "approved" && review.reviewer?.trim() && review.originalValueConfirmed === true
    && review.snapshotSha256 === getGuideReviewSnapshot(guide, evidence));
  return { published, adEligible: published && evidence?.status !== "closed" && !ADSENSE_REVIEW_MODE,
    reviewer: published ? review!.reviewer : undefined,
    reviewedAt: published ? review!.reviewedAt : undefined, evidence, review };
}
