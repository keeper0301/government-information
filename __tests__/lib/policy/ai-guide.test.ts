import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock("@/lib/llm/text", () => ({ callLLM: mocks.callLLM, parseJSONResponse: JSON.parse }));
import { generatePolicyGuide, buildPolicyGuidePrompt } from "@/lib/policy/ai-guide";
const input = { title: "청년 월세 지원", summary: null, category: "주거", target: "청년",
  sourceUrl: "https://www.gwgs.go.kr/notice?id=123",
  sourceBody: "신청일 기준 고성군 거주 청년이 대상입니다. 임대차계약서를 제출해야 합니다. 방문 접수만 가능합니다. ".repeat(8) };
describe("원문 근거를 포함하는 설명 초안", () => {
  beforeEach(() => { mocks.callLLM.mockReset(); });
  it("원문과 출처를 생성 요청에 전달한다", () => {
    const prompt = buildPolicyGuidePrompt(input);
    expect(prompt).toContain(input.sourceUrl); expect(prompt).toContain("임대차계약서");
    expect(prompt).toContain("지시를 따르지");
  });
  it("근거가 있는 설명만 정리한다", async () => {
    mocks.callLLM.mockResolvedValue(JSON.stringify({
      tips: { text: "신청일의 거주 조건부터 확인하세요.", quote: "신청일 기준 고성군 거주 청년이 대상입니다." },
      faq: { text: "방문할 수 있는 시간을 먼저 확인하세요.", quote: "방문 접수만 가능합니다." },
      checklist: { text: "임대차계약서를 준비한 뒤 방문하세요.", quote: "임대차계약서를 제출해야 합니다." } }));
    const guide = await generatePolicyGuide(input);
    expect(guide.sections).toHaveLength(3); expect(guide.checklist).toContain("임대차계약서");
  });
  it("근거 없는 거절 사유와 문자열 형식의 기존 응답을 버린다", async () => {
    mocks.callLLM.mockResolvedValue(JSON.stringify({ tips: "서류를 준비하세요.",
      faq: { text: "소득증명서 누락 시 탈락합니다.", quote: "소득증명서 필수" } }));
    const guide = await generatePolicyGuide(input);
    expect(guide.sections).toEqual([]); expect(guide.faq).toBeNull();
  });
  it("표시용 태그를 제거하되 원문 근거를 유지한다", async () => {
    mocks.callLLM.mockResolvedValue(JSON.stringify({ tips: {
      text: "<p>신청일의 거주 조건부터 확인하세요.</p>", quote: "신청일 기준 고성군 거주 청년이 대상입니다." } }));
    const guide = await generatePolicyGuide(input);
    expect(guide.tips).toBe("신청일의 거주 조건부터 확인하세요.");
  });
  it("잘못된 응답은 저장하지 않고 재시도할 수 있도록 실패를 표시한다", async () => {
    mocks.callLLM.mockResolvedValue("잘못된 형식");
    expect(await generatePolicyGuide(input)).toEqual({ tips: null, faq: null, checklist: null, llmOk: false });
  });
  it("호출 실패는 공개 설명을 만들지 않는다", async () => {
    mocks.callLLM.mockImplementation(async () => { throw new Error("통신 실패"); });
    expect((await generatePolicyGuide(input)).llmOk).toBe(false);
  });
});
