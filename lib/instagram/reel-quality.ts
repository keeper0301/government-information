// ============================================================
// Instagram Reels 후보 적합도/정보 밀도 점수
// ============================================================

import { stripHtml, buildReelVideoPlan, type ReelVideoPostInput } from "./reel-video-plan";

export type ReelQualityResult = {
  approved: boolean;
  score: number;
  reasons: string[];
  metrics: {
    hasAmount: boolean;
    hasDeadlineOrApply: boolean;
    hasTarget: boolean;
    hasBenefit: boolean;
    hasApply: boolean;
    hasSpecificNumber: boolean;
    preferredTopic: boolean;
    narrowOrSensitiveTopic: boolean;
    fallbackLikeSlides: number;
    detailFactCount: number;
    hasConcreteDetail: boolean;
  };
};

const AMOUNT_RE = /\d+\s*(?:만|천|억)?\s*원|월\s*최대|최대\s*\d+|지원금|축하금|바우처|대출|융자|보증|감면|환급/;
const APPLY_RE = /신청|접수|마감|기간|서류|누리집|주민센터|온라인|방문|문의|공식/;
const TARGET_RE = /대상|자격|조건|소득|연령|청년|소상공|자영|사업자|가구|부모|아동|영유아|학생|신혼|노인|어르신/;
const BENEFIT_RE = /지원|금액|혜택|지급|대여|상담|교육|훈련|월세|임대료|자금|보증|융자|대출|축하금|바우처/;
const PREFERRED_TOPIC_RE = /청년|소상공|자영|사업자|주거|월세|전세|육아|영유아|아동|교육|창업|대출|융자|자금/;
const NARROW_OR_SENSITIVE_RE = /무연고|행려|장례|사망|시신|화장|귀향|노숙|위기\s*가구|긴급복지|정신질환|중독/;
const FALLBACK_RE = /지역·나이·소득 기준|공고마다 달라|공식 누리집이나 담당 기관|자격·마감은 바뀔 수|본문에서 지원|공식 모집 공고에서 확인/;

export function scoreReelCandidate(post: ReelVideoPostInput): ReelQualityResult {
  const haystack = stripHtml([post.title, post.category, post.meta_description, post.content].filter(Boolean).join("\n"));
  const plan = buildReelVideoPlan(post);
  const slideText = plan.slides.map((slide) => `${slide.title}\n${slide.body}`).join("\n");
  const detailFactLines = plan.slides
    .slice(1, -1)
    .flatMap((slide) => slide.body.split("\n"))
    .map((line) => stripHtml(line).trim())
    .filter((line) => line.length >= 6 && !FALLBACK_RE.test(line));

  const metrics = {
    hasAmount: AMOUNT_RE.test(haystack),
    hasDeadlineOrApply: APPLY_RE.test(haystack),
    hasTarget: TARGET_RE.test(slideText) || TARGET_RE.test(haystack),
    hasBenefit: BENEFIT_RE.test(slideText) || BENEFIT_RE.test(haystack),
    hasApply: APPLY_RE.test(slideText) || APPLY_RE.test(haystack),
    hasSpecificNumber: /\d/.test(haystack),
    preferredTopic: PREFERRED_TOPIC_RE.test(haystack),
    narrowOrSensitiveTopic: NARROW_OR_SENSITIVE_RE.test(haystack),
    fallbackLikeSlides: plan.slides.filter((slide) => FALLBACK_RE.test(slide.body)).length,
    detailFactCount: detailFactLines.length,
    hasConcreteDetail: detailFactLines.length >= 5,
  };

  let score = 0;
  if (metrics.hasAmount) score += 2;
  if (metrics.hasTarget) score += 2;
  if (metrics.hasBenefit) score += 2;
  if (metrics.hasApply) score += 2;
  if (metrics.hasDeadlineOrApply) score += 1;
  if (metrics.hasSpecificNumber) score += 1;
  if (metrics.preferredTopic) score += 2;
  if (metrics.hasConcreteDetail) score += 1;
  score -= metrics.fallbackLikeSlides;
  if (metrics.narrowOrSensitiveTopic) score -= 3;

  const reasons: string[] = [];
  if (!metrics.hasTarget) reasons.push("reel_missing_target_fact");
  if (!metrics.hasBenefit) reasons.push("reel_missing_benefit_fact");
  if (!metrics.hasApply) reasons.push("reel_missing_apply_fact");
  if (metrics.fallbackLikeSlides >= 2) reasons.push("reel_too_many_fallback_facts");
  if (!metrics.hasConcreteDetail) reasons.push("reel_detail_fact_count_low");
  if (metrics.narrowOrSensitiveTopic) reasons.push("reel_narrow_or_sensitive_topic");
  if (score < 6) reasons.push("reel_information_score_low");

  return {
    approved: score >= 6 && metrics.hasTarget && metrics.hasBenefit && metrics.hasApply && metrics.fallbackLikeSlides < 2 && metrics.hasConcreteDetail,
    score,
    reasons,
    metrics,
  };
}

export function compareReelCandidates(a: ReelVideoPostInput, b: ReelVideoPostInput): number {
  const qa = scoreReelCandidate(a);
  const qb = scoreReelCandidate(b);
  return qb.score - qa.score;
}
