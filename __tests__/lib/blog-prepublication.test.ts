import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateBlogQuality } from "@/lib/blog/quality-check";
vi.mock("@/lib/llm/text", () => ({ callLLM: vi.fn(), parseJSONResponse: JSON.parse }));
import { callLLM } from "@/lib/llm/text";

describe("prepublication fail closed", () => {
  beforeEach(() => { vi.mocked(callLLM).mockReset(); vi.mocked(callLLM).mockResolvedValue(JSON.stringify({score:4, reason:"OK", improvements:[]})); });
  it.each([{}, null, [], {score:"4"}, {score:2.5}, {score:0}, {score:6}, {score:4,reason:4}])("holds malformed response %j", async (response) => {
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify(response));
    expect((await evaluateBlogQuality({title:"정상 제목",content:"본문"}, {failClosed:true})).needsReview).toBe(true);
  });
  it.each(["N만원", "N만 원", "NN 만원", "Ｎ만 원", "&#78;만원", "N<strong>만</strong>원", "N천만원", "N백만 원", '<img alt="N만원">', '<a title="N만원">신청</a>'])("blocks amount %s even with score 4", async (amount) => {
    expect((await evaluateBlogQuality({title:`지원금 최대 ${amount}`,content:"본문"})).needsReview).toBe(true);
  });
  it("checks the entire body", async () => {
    expect((await evaluateBlogQuality({title:"지원금",content:"가".repeat(6000)+"최대 N만원"})).needsReview).toBe(true);
  });
  it.each(["10만 원", "1,000만원", "N잡", "ANN", "NH농협", "NCS"])("allows normal text %s", async (text) => {
    expect((await evaluateBlogQuality({title:text,content:"본문"})).needsReview).toBe(false);
  });
});
