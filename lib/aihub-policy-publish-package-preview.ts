import {
  buildPolicyOperatorReviewPreview,
  type PolicyOperatorReviewItem,
  type PolicyOperatorReviewSummary,
} from "@/lib/aihub-policy-operator-review";

export type PolicyPublishPackagePreviewItem = {
  id: string;
  sourceOperatorReviewId: string;
  status: "publish_package_preview";
  title: string;
  bodyPreview: string;
  metaDescription: string;
  officialSources: string[];
  prePublishApprovalChecklist: string[];
  publishGate: {
    approvedToPublish: false;
    reason: "publish_package_preview_requires_final_operator_approval";
  };
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyPublishPackagePreviewSummary = {
  generatedFor: "AIHub 4순위 W8 정책 publish package preview";
  year: 2026;
  status: "read_only_publish_package_preview";
  count: number;
  sourceOperatorReview: Pick<PolicyOperatorReviewSummary, "count" | "countsByStatus" | "safety">;
  sourceStatus: "review_passed_preview";
  packageFields: ["title", "bodyPreview", "metaDescription", "officialSources", "prePublishApprovalChecklist"];
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    publishPackagePreviewMeans: "approval_package_only_not_live_publish";
  };
  items: PolicyPublishPackagePreviewItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildPublishPackagePreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

const PACKAGE_FIELDS: PolicyPublishPackagePreviewSummary["packageFields"] = [
  "title",
  "bodyPreview",
  "metaDescription",
  "officialSources",
  "prePublishApprovalChecklist",
];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildMetaDescription(item: PolicyOperatorReviewItem): string {
  const description = `${item.region} ${item.policyName} 2026년 기준 신청 대상, 절차, 필요 서류를 공식 출처로 확인하기 전 approval 전용 미리보기입니다.`;
  return compactWhitespace(description).slice(0, 155);
}

function buildBodyPreview(item: PolicyOperatorReviewItem): string {
  return [
    `## ${item.title}`,
    "",
    item.humanizedPreviewText,
    "",
    "### 발행 전 확인 필요",
    "- 신청 대상·기간·필수 서류를 공식 원문에서 다시 확인",
    "- 지원 가능 여부나 금액을 원문 없이 단정하지 않기",
    "- 운영자 최종 승인 전에는 공개 발행하지 않기",
    "",
    "### 공식 출처",
    ...item.sourceUrls.map((url) => `- ${url}`),
  ].join("\n");
}

function buildApprovalChecklist(item: PolicyOperatorReviewItem): string[] {
  return [
    "제목이 지역·정책명·2026 정보를 과장 없이 담고 있음",
    "본문 preview가 신청 가능·지원금 지급을 단정하지 않음",
    "메타 설명이 검색 의도는 담되 미확인 혜택을 약속하지 않음",
    "공식 출처 URL을 운영자가 직접 열어 정책 원문/검색 결과임을 확인함",
    "신청 기간·대상·서류·담당 기관 최신성을 원문으로 확인함",
    "humanize-korean/prepublish gate 통과 후에도 사실·숫자·URL이 보존됨",
    "최종 승인 전 DB write, publish, GSC, IndexNow, Naver submit이 모두 false임",
    ...item.holdChecklist.slice(0, 2),
  ];
}

function packageItemFromOperatorReview(item: PolicyOperatorReviewItem): PolicyPublishPackagePreviewItem {
  return {
    id: `publish-package-preview-${item.id}`,
    sourceOperatorReviewId: item.id,
    status: "publish_package_preview",
    title: item.title,
    bodyPreview: buildBodyPreview(item),
    metaDescription: buildMetaDescription(item),
    officialSources: item.sourceUrls,
    prePublishApprovalChecklist: buildApprovalChecklist(item),
    publishGate: {
      approvedToPublish: false,
      reason: "publish_package_preview_requires_final_operator_approval",
    },
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
    },
  };
}

export async function buildPolicyPublishPackagePreview(
  options: BuildPublishPackagePreviewOptions = {},
): Promise<PolicyPublishPackagePreviewSummary> {
  const operatorReview = await buildPolicyOperatorReviewPreview(options);
  const items = operatorReview.items
    .filter((item) => item.status === "review_passed_preview")
    .map(packageItemFromOperatorReview);

  return {
    generatedFor: "AIHub 4순위 W8 정책 publish package preview",
    year: 2026,
    status: "read_only_publish_package_preview",
    count: items.length,
    sourceOperatorReview: {
      count: operatorReview.count,
      countsByStatus: operatorReview.countsByStatus,
      safety: operatorReview.safety,
    },
    sourceStatus: "review_passed_preview",
    packageFields: PACKAGE_FIELDS,
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      publishPackagePreviewMeans: "approval_package_only_not_live_publish",
    },
    items,
  };
}
