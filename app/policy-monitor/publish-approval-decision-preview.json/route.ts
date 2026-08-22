import { NextResponse, type NextRequest } from "next/server";

import {
  buildPolicyPublishApprovalDecisionPreview,
  type PolicyPublishApprovalDecisionOption,
} from "@/lib/aihub-policy-publish-approval-decision-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DECISION_OPTIONS: PolicyPublishApprovalDecisionOption[] = [
  "approve_for_publish_preview_only",
  "hold_for_source_readback",
  "request_revision",
];

function parseParam(request: NextRequest, key: string): number | undefined {
  const value = request.nextUrl.searchParams.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDecision(request: NextRequest): PolicyPublishApprovalDecisionOption | undefined {
  const decision = request.nextUrl.searchParams.get("decision");
  if (!decision) return undefined;
  return DECISION_OPTIONS.includes(decision as PolicyPublishApprovalDecisionOption)
    ? (decision as PolicyPublishApprovalDecisionOption)
    : undefined;
}

export async function GET(request: NextRequest) {
  const preview = await buildPolicyPublishApprovalDecisionPreview({
    itemLimit: parseParam(request, "limit"),
    sourceLimit: parseParam(request, "sources"),
    timeoutMs: parseParam(request, "timeoutMs"),
    selectedDecision: parseDecision(request),
  });

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
