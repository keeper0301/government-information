import { describe, expect, it } from "vitest";

import { verifyNaverPublicPostHtml } from "@/lib/naver-blog/public-readback";
import { assessNaverRenderedPayload } from "@/lib/naver-blog/rendered-payload-quality";

const expectation = {
  naverUrl: "https://blog.naver.com/leclerc23/224417830818",
  expectedLogNo: "224417830818",
  title: "청주시 저소득 건강보험료·노인장기요양보험료 지원",
  corePhrase: "청주시 저소득 세대의 국민건강보험료",
  queueId: "ba7edd39-e246-46ea-989e-19c6db8fe2bf",
  contentId: "37d035ba-6afe-4bc3-b868-10810c861d7c",
};

describe("Naver public reconciliation guards", () => {
  it("requires title, core phrase, logNo and exact CTA identity", () => {
    const html = `<title>${expectation.title}</title><p>${expectation.corePhrase}</p><a href="https://www.keepioo.com/blog/x?utm_content=${expectation.contentId}&amp;utm_id=${expectation.queueId}">보기</a>`;
    expect(verifyNaverPublicPostHtml(html, expectation)).toMatchObject({
      ok: true,
      checks: { title: true, corePhrase: true, exactCtaIdentity: true, logNo: true },
    });
  });

  it("fails when CTA identity belongs to another queue", () => {
    const html = `<title>${expectation.title}</title><p>${expectation.corePhrase}</p><a href="https://www.keepioo.com/blog/x?utm_content=${expectation.contentId}&utm_id=other">보기</a>`;
    expect(verifyNaverPublicPostHtml(html, expectation)).toMatchObject({
      ok: false,
      failures: ["exactCtaIdentity"],
    });
  });

  it("holds duplicated FAQ and placeholder copy before publish", () => {
    const qa = assessNaverRenderedPayload("<p style='font-weight:800'>자주 묻는 질문</p><p style='font-weight:800'>자주 묻는 질문</p><p>공식 페이지의 신청 기간 또는 상시 여부 확인</p>");
    expect(qa.ok).toBe(false);
    expect(qa.issues).toEqual(expect.arrayContaining(["duplicate_heading", "duplicate_faq", "placeholder_period"]));
  });

  it("passes a clean rendered payload", () => {
    expect(assessNaverRenderedPayload("<p style='font-weight:800'>지원 대상</p><p>청주시 지역가입자 중 공식 조건을 충족한 세대입니다.</p>")).toEqual({ ok: true, issues: [], evidence: [] });
  });
});
