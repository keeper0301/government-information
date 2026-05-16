// ============================================================
// 외부 발행 품질 게이트
// ============================================================
// 네이버·인스타 같은 외부 채널은 한번 올라가면 수정/삭제 비용이 크다.
// 따라서 blog-quality-check cron 이 통과시킨 글만 자동 발행 대상으로 삼는다.
// ============================================================

export type BlogQualityGateInput = {
  admin_review_required: boolean | null;
};

export function isExternalPublishQualityApproved(
  post: BlogQualityGateInput,
): boolean {
  return post.admin_review_required === false;
}
