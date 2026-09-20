import { createHash } from "node:crypto";

import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertToNaverBlogHtml, type BlogPostForNaver } from "./format";

type CandidatePost = BlogPostForNaver & {
  admin_review_required: boolean | null;
  source_program_id: string | null;
  source_program_type: "welfare" | "loan" | "curation" | null;
};

type CandidateQueueRow = {
  id: string;
  blog_post_id: string;
  status: string;
  attempt_count: number | null;
  created_at: string;
  blog_post: CandidatePost | CandidatePost[];
};

type SourceEvidence = {
  type: CandidatePost["source_program_type"];
  id: string | null;
  title: string | null;
  source: string | null;
  sourceUrl: string | null;
  applyUrl: string | null;
  applyStart: string | null;
  applyEnd: string | null;
};

export type NaverApprovalCandidate = {
  checkedAt: string;
  status: "ready_for_exact_approval" | "hold" | "no_candidate";
  mutation: "none_read_only";
  candidate: null | {
    queueId: string;
    blogPostId: string;
    queueCreatedAt: string;
    attemptCount: number;
    title: string;
    bodyHtml: string;
    backlinkUrl: string;
    coverImageUrl: string | null;
    contentFingerprint: string;
    approvalPhrase: string;
    approvalScope: string;
    sourceEvidence: SourceEvidence;
    quality: ReturnType<typeof assessExternalPublishQuality>;
    duplicateEvidence: {
      successfulAuditCount: number;
      safe: boolean;
    };
    disclosure: {
      required: boolean;
      reason: string;
    };
    image: {
      ownership: "first_party_generated" | "none";
      rightsReason: string;
      accessibilityText: string;
    };
  };
  holdReasons: string[];
  safety: string[];
};

function normalizePost(value: CandidateQueueRow["blog_post"]): CandidatePost | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function readSourceEvidence(post: CandidatePost): Promise<SourceEvidence> {
  const empty: SourceEvidence = {
    type: post.source_program_type,
    id: post.source_program_id,
    title: null,
    source: null,
    sourceUrl: null,
    applyUrl: null,
    applyStart: null,
    applyEnd: null,
  };
  if (!post.source_program_id || !["welfare", "loan"].includes(post.source_program_type ?? "")) {
    return empty;
  }

  const table = post.source_program_type === "welfare" ? "welfare_programs" : "loan_programs";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .select("id, title, source, source_url, apply_url, apply_start, apply_end")
    .eq("id", post.source_program_id)
    .maybeSingle();
  if (error || !data) return empty;
  return {
    type: post.source_program_type,
    id: post.source_program_id,
    title: data.title ?? null,
    source: data.source ?? null,
    sourceUrl: data.source_url ?? null,
    applyUrl: data.apply_url ?? null,
    applyStart: data.apply_start ?? null,
    applyEnd: data.apply_end ?? null,
  };
}

export async function getNaverApprovalCandidate(): Promise<NaverApprovalCandidate> {
  const checkedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("naver_blog_queue")
    .select(
      "id, blog_post_id, status, attempt_count, created_at, blog_post:blog_posts!inner(slug, title, content, meta_description, category, cover_image, admin_review_required, source_program_id, source_program_type)",
    )
    .eq("status", "pending")
    .eq("blog_post.admin_review_required", false)
    .lt("attempt_count", 3)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Naver approval candidate query failed: ${error.message}`);
  if (!data) {
    return {
      checkedAt,
      status: "no_candidate",
      mutation: "none_read_only",
      candidate: null,
      holdReasons: ["no_retryable_quality_approved_pending_candidate"],
      safety: ["no_publish", "no_db_mutation", "no_external_submit"],
    };
  }

  const row = data as unknown as CandidateQueueRow;
  const post = normalizePost(row.blog_post);
  if (!post) throw new Error("Naver approval candidate has no joined blog post");
  const quality = assessExternalPublishQuality(post);
  const payload = convertToNaverBlogHtml(post);
  const sourceEvidence = await readSourceEvidence(post);
  const { count: successfulAuditCount, error: auditError } = await admin
    .from("naver_publish_audit")
    .select("id", { count: "exact", head: true })
    .eq("post_id", row.blog_post_id)
    .eq("result", "success");
  if (auditError) throw new Error(`Naver duplicate audit query failed: ${auditError.message}`);

  const fingerprint = createHash("sha256")
    .update(`${row.id}\n${row.blog_post_id}\n${payload.title}\n${payload.bodyHtml}\n${payload.backlinkUrl}\n${payload.coverImageUrl ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  const duplicateCount = successfulAuditCount ?? 0;
  const holdReasons: string[] = [];
  if (!quality.approved) holdReasons.push(...quality.reasons);
  if (duplicateCount > 0) holdReasons.push("prior_success_audit_exists");
  if (!sourceEvidence.sourceUrl && !sourceEvidence.applyUrl) holdReasons.push("official_source_url_missing");

  return {
    checkedAt,
    status: holdReasons.length === 0 ? "ready_for_exact_approval" : "hold",
    mutation: "none_read_only",
    candidate: {
      queueId: row.id,
      blogPostId: row.blog_post_id,
      queueCreatedAt: row.created_at,
      attemptCount: row.attempt_count ?? 0,
      title: payload.title,
      bodyHtml: payload.bodyHtml,
      backlinkUrl: payload.backlinkUrl,
      coverImageUrl: payload.coverImageUrl,
      contentFingerprint: fingerprint,
      approvalPhrase: `승인: keepioo 네이버 후보 ${row.id} 게시 ${fingerprint}`,
      approvalScope: "이 queueId와 contentFingerprint가 모두 일치하는 pending 후보 1건에만 1회 유효",
      sourceEvidence,
      quality,
      duplicateEvidence: { successfulAuditCount: duplicateCount, safe: duplicateCount === 0 },
      disclosure: {
        required: false,
        reason: "자사 정책정보 링크만 포함하며 제휴·협찬·대가성 링크가 없음. 제휴 링크가 추가되면 재검수 필요.",
      },
      image: {
        ownership: payload.coverImageUrl ? "first_party_generated" : "none",
        rightsReason: payload.coverImageUrl
          ? "keepioo 자체 /api/naver-thumbnail/ 생성 이미지로 제3자 이미지 권리 위험이 없음."
          : "이미지 없음.",
        accessibilityText: payload.coverImageUrl
          ? payload.title
          : "이미지 없음",
      },
    },
    holdReasons,
    safety: [
      "no_publish",
      "no_db_mutation",
      "no_external_submit",
      "approval_phrase_single_candidate_only",
      "approval_invalid_if_queue_or_content_fingerprint_changes",
    ],
  };
}