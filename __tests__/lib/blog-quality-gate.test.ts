import { describe, expect, it } from "vitest";
import {
  assessExternalPublishQuality,
  isExternalPublishQualityApproved,
} from "@/lib/blog/quality-gate";

const approvedPost = {
  admin_review_required: false,
  title: "2026년 경기도 청년 기본소득 신청 대상과 지원금 총정리",
  meta_description:
    "경기도 청년 기본소득의 지원 대상, 분기별 지원 금액, 신청 기간, 제출 서류와 공식 신청 경로를 한 번에 확인하세요. 접수 전에는 최신 공고와 거주 기준을 함께 확인해야 합니다.",
  category: "청년",
  content: `
    <h2>지원 대상</h2>
    <p>경기도에 거주하는 만 24세 청년 중 거주 기간 조건을 충족한 사람이 대상입니다. 소득 조건은 별도 공고에서 확인해야 합니다.</p>
    <h2>지원 금액</h2>
    <p>분기별 25만원, 연 최대 100만원을 지역화폐로 받을 수 있습니다. 실제 지급 방식은 지자체 예산과 공고에 따라 달라질 수 있습니다.</p>
    <h2>신청 기간과 방법</h2>
    <p>신청 기간은 분기별 공고를 기준으로 하며, 공식 홈페이지 또는 지자체 누리집에서 온라인 접수합니다. 마감일 전 신청 상태를 반드시 확인하세요.</p>
    <h2>제출 서류</h2>
    <p>주민등록초본, 거주 확인 자료, 본인 인증 자료가 필요할 수 있습니다. 기관 요청에 따라 추가 증빙 서류가 생길 수 있습니다.</p>
    <h2>문의처</h2>
    <p>자세한 내용은 경기도 또는 주소지 시군 담당 센터에 문의하고, 최종 조건은 공식 공고문에서 확인하세요.</p>
    <p>이 제도는 예산 소진, 신청 시점, 지역별 운영 방식에 따라 세부 조건이 달라질 수 있으므로 신청 전에 최신 공지를 확인하는 것이 좋습니다.</p>
    <p>신청 전에는 본인의 주민등록상 거주지, 최근 이사 여부, 지급 연령 기준일을 함께 확인해야 합니다. 같은 청년 정책이라도 시군별 접수 일정과 지급 일정이 다를 수 있습니다.</p>
    <p>신청 후에는 접수 완료 문자나 마이페이지 상태를 확인하고, 보완 서류 요청이 오면 정해진 기간 안에 다시 제출해야 합니다. 미제출이면 지급 대상에서 제외될 수 있습니다.</p>
    <p>가장 안전한 순서는 공식 공고 확인, 자격 조건 대조, 서류 준비, 온라인 접수, 접수 상태 확인입니다. 특히 마감일 직전에는 접속자가 몰릴 수 있어 여유 있게 신청하는 편이 좋습니다.</p>
  `,
};

describe("isExternalPublishQualityApproved", () => {
  it("품질 검수와 네이버 외부 발행 최소 정보량을 모두 통과한 글만 허용한다", () => {
    expect(isExternalPublishQualityApproved(approvedPost)).toBe(true);
  });

  it("검수 필요 글은 외부 자동 발행을 막는다", () => {
    expect(
      isExternalPublishQualityApproved({ ...approvedPost, admin_review_required: true }),
    ).toBe(false);
  });

  it("아직 검수되지 않은 글도 외부 자동 발행을 막는다", () => {
    expect(
      isExternalPublishQualityApproved({ ...approvedPost, admin_review_required: null }),
    ).toBe(false);
  });

  it("짧고 템플릿 냄새 나는 글은 admin_review_required=false여도 막는다", () => {
    const assessment = assessExternalPublishQuality({
      admin_review_required: false,
      title: "GS25 신상품 안내",
      meta_description: "GS25 신상품 정보를 간단히 정리했습니다.",
      category: "생활",
      content:
        "<p>GS25 신상품 매대 운영 체크포인트에 대해 찾는 분들이 많아서 핵심만 보기 좋게 정리해봤어요.</p><p>바로가기 👇👇</p><p>문의 방법\n상담 가능 시간\n확인할 내용\n특징</p>",
    });

    expect(assessment.approved).toBe(false);
    expect(assessment.reasons).toContain("content_too_short_for_external_publish");
    expect(assessment.reasons).toContain("template_smell_detected");
  });

  it("구체적으로 발견된 오염 문구도 자동 발행 전에 막는다", () => {
    const assessment = assessExternalPublishQuality({
      ...approvedPost,
      content: `${approvedPost.content}<p>지역: 반드시 확인하세요하고 신청하세요!</p>`,
    });

    expect(assessment.approved).toBe(false);
    expect(assessment.reasons).toContain("template_smell_detected");
    expect(assessment.metrics.hasTemplateSmell).toBe(true);
  });

  it("프롬프트 금지 문구도 자동 발행 전에 막는다", () => {
    const assessment = assessExternalPublishQuality({
      ...approvedPost,
      content: `${approvedPost.content}<p>여러분, 이거 그냥 넘기면 안 돼요. 정말 중요한 마감부터 봐야 해요.</p>`,
    });

    expect(assessment.approved).toBe(false);
    expect(assessment.reasons).toContain("template_smell_detected");
    expect(assessment.metrics.hasTemplateSmell).toBe(true);
  });

  it("거절 사유와 지표를 반환해 운영자가 무엇을 고칠지 알 수 있다", () => {
    const assessment = assessExternalPublishQuality({
      admin_review_required: false,
      title: "짧은 제목",
      meta_description: "짧음",
      content: "<p>신청하세요.</p>",
    });

    expect(assessment.approved).toBe(false);
    expect(assessment.reasons).toEqual(
      expect.arrayContaining([
        "title_too_short",
        "meta_description_too_short",
        "content_too_short_for_external_publish",
        "insufficient_policy_information_signals",
      ]),
    );
    expect(assessment.metrics.plainTextLength).toBeGreaterThan(0);
  });
});
