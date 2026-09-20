import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNaverContentFingerprint } from "./content-identity";
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
  applyMethod: string | null;
  requiredDocuments: string | null;
  benefits: string | null;
  contactInfo: string | null;
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
    approvalPhrase: string | null;
    approvalScope: string;
    sourceEvidence: SourceEvidence;
    quality: ReturnType<typeof assessExternalPublishQuality>;
    factualRiskReasons: string[];
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
    applyMethod: null,
    requiredDocuments: null,
    benefits: null,
    contactInfo: null,
  };
  if (!post.source_program_id || !["welfare", "loan"].includes(post.source_program_type ?? "")) {
    return empty;
  }

  const admin = createAdminClient();
  const commonSelect =
    "id, title, source, source_url, apply_url, apply_start, apply_end, apply_method, required_documents, contact_info";
  const query =
    post.source_program_type === "welfare"
      ? admin.from("welfare_programs").select(`${commonSelect}, benefits`)
      : admin.from("loan_programs").select(`${commonSelect}, loan_amount`);
  const { data, error } = await query.eq("id", post.source_program_id).maybeSingle();
  if (error || !data) return empty;
  const raw = data as Record<string, unknown>;
  return {
    type: post.source_program_type,
    id: post.source_program_id,
    title: typeof raw.title === "string" ? raw.title : null,
    source: typeof raw.source === "string" ? raw.source : null,
    sourceUrl: typeof raw.source_url === "string" ? raw.source_url : null,
    applyUrl: typeof raw.apply_url === "string" ? raw.apply_url : null,
    applyStart: typeof raw.apply_start === "string" ? raw.apply_start : null,
    applyEnd: typeof raw.apply_end === "string" ? raw.apply_end : null,
    applyMethod: typeof raw.apply_method === "string" ? raw.apply_method : null,
    requiredDocuments: typeof raw.required_documents === "string" ? raw.required_documents : null,
    benefits:
      typeof raw.benefits === "string"
        ? raw.benefits
        : typeof raw.loan_amount === "string"
          ? raw.loan_amount
          : null,
    contactInfo: typeof raw.contact_info === "string" ? raw.contact_info : null,
  };
}

export function assessApprovalFactRisks(input: {
  title: string;
  content: string;
  source: SourceEvidence;
}): string[] {
  const combined = `${input.title}\n${input.content}`;
  const reasons: string[] = [];

  if (/…|\.\.\./.test(combined)) reasons.push("truncated_or_ellipsis_claim_present");
  if (
    /가능한 것으로 보이나|일반적일 수|수 주가 소요|일정 비율 또는 정액|일부 또는 전부|가급적 빨리|주저하지 말고/.test(
      combined,
    )
  ) {
    reasons.push("speculative_or_unsupported_claim_present");
  }
  if (/2026년/.test(combined) && !/2026/.test(input.source.title ?? "") && !input.source.applyStart && !input.source.applyEnd) {
    reasons.push("year_claim_not_supported_by_source_dates");
  }
  if (!input.source.applyMethod && /방문 신청|온라인 신청|신청 서류|행정복지센터|동사무소/.test(combined)) {
    reasons.push("application_method_claim_not_supported_by_source");
  }
  if (!input.source.requiredDocuments && /주민등록등본|원천징수영수증|재산세 납부증명서|통장 사본|신분증/.test(combined)) {
    reasons.push("required_document_claim_not_supported_by_source");
  }
  if (/감면율|감면 금액|일부 또는 전부|정액/.test(combined) && !/\d|%|일부|전부|정액|최대/.test(input.source.benefits ?? "")) {
    reasons.push("benefit_amount_claim_not_supported_by_source");
  }

  return [...new Set(reasons)];
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
  const payload = convertToNaverBlogHtml(post, { contentId: row.blog_post_id, queueId: row.id });
  const sourceEvidence = await readSourceEvidence(post);
  const factualRiskReasons = assessApprovalFactRisks({
    title: post.title,
    content: post.content,
    source: sourceEvidence,
  });
  const { count: successfulAuditCount, error: auditError } = await admin
    .from("naver_publish_audit")
    .select("id", { count: "exact", head: true })
    .eq("post_id", row.blog_post_id)
    .eq("result", "success");
  if (auditError) throw new Error(`Naver duplicate audit query failed: ${auditError.message}`);

  const fingerprint = createNaverContentFingerprint({
    queueId: row.id,
    contentId: row.blog_post_id,
    title: payload.title,
    bodyHtml: payload.bodyHtml,
    backlinkUrl: payload.backlinkUrl,
    coverImageUrl: payload.coverImageUrl,
  });
  const duplicateCount = successfulAuditCount ?? 0;
  const holdReasons: string[] = [];
  if (!quality.approved) holdReasons.push(...quality.reasons);
  if (duplicateCount > 0) holdReasons.push("prior_success_audit_exists");
  if (!sourceEvidence.sourceUrl && !sourceEvidence.applyUrl) holdReasons.push("official_source_url_missing");
  holdReasons.push(...factualRiskReasons);

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
      approvalPhrase:
        holdReasons.length === 0
          ? `승인: keepioo 네이버 후보 ${row.id} 게시 ${fingerprint}`
          : null,
      approvalScope: "이 queueId와 contentFingerprint가 모두 일치하는 pending 후보 1건에만 1회 유효",
      sourceEvidence,
      quality,
      factualRiskReasons,
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