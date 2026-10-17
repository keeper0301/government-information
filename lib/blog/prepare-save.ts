import { evaluateBlogQuality, type BlogQualityResult } from "./quality-check";
import { hasUnfinishedAmount, isBlogReadable, type BlogPublicationState, type BlogPublicFields } from "./publication-eligibility";

type Snapshot = BlogPublicationState & { updated_at: string };
type Review = (post: BlogPublicFields & {title:string;content:string}, opts:{failClosed:boolean}) => Promise<BlogQualityResult>;

/** Review a proposed replacement without changing the currently public row. */
export async function prepareBlogSave(
  latest: Snapshot,
  edits: BlogPublicFields,
  expectedUpdatedAt: string,
  review: Review = evaluateBlogQuality,
): Promise<Record<string, unknown> | null> {
  if (latest.updated_at !== expectedUpdatedAt) throw new Error("다른 변경이 있습니다. 새로고침 후 다시 저장하세요.");
  const normalize = (field: string, value: unknown) =>
    field === "tags" && (value === null || (Array.isArray(value) && value.length === 0)) ? [] : value;
  const changed = Object.entries(edits).some(([field, value]) =>
    JSON.stringify(normalize(field, latest[field as keyof BlogPublicFields])) !== JSON.stringify(normalize(field, value)));
  if (!changed) return null;
  const proposed = {...latest, ...edits}; // Include FAQ and other fields not present in the form.
  if (isBlogReadable(latest)) {
    if (hasUnfinishedAmount(proposed)) throw new Error("미완성 금액 문구가 있어 저장하지 않았습니다. 기존 공개본은 유지됩니다.");
    const result = await review({ ...proposed, title: proposed.title ?? "", content: proposed.content ?? "" }, {failClosed:true});
    if (result.needsReview) throw new Error("수정본 검수가 통과하지 못해 저장하지 않았습니다. 기존 공개본은 유지됩니다.");
    return {...edits, admin_review_required:false, admin_review_score:result.score, admin_reviewed_at:new Date().toISOString()};
  }
  // Saving a draft/held post cannot approve it or publish it.
  return {...edits, admin_review_required:true, admin_review_score:null, admin_reviewed_at:null};
}
