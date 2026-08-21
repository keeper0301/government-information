import { describe, expect, it } from "vitest";

import {
  AIHUB_POLICY_OPPORTUNITIES,
  buildPolicyExportCsv,
  buildPolicyExportRows,
  buildPolicyTopicSeeds,
  buildPublicReadbackCandidates,
  getPrimaryPolicyOpportunities,
  POLICY_MONITOR_REGIONS,
} from "@/lib/aihub-policy-opportunities";

describe("AIHub policy opportunities", () => {
  it("keeps AIHub 4th-priority policy datasets with public source URLs", () => {
    expect(AIHUB_POLICY_OPPORTUNITIES).toHaveLength(5);
    expect(AIHUB_POLICY_OPPORTUNITIES.every((item) => item.aihubUrl.startsWith("https://aihub.or.kr/"))).toBe(true);
    expect(AIHUB_POLICY_OPPORTUNITIES.some((item) => item.policyName.includes("공공분야 고객응대"))).toBe(true);
  });

  it("prioritizes public-service, support, welfare and safety candidates", () => {
    const primary = getPrimaryPolicyOpportunities();
    expect(primary.map((item) => item.policyName)).toEqual([
      "공공분야 고객응대 데이터",
      "금융, 법률 문서 기계독해 데이터",
      "독거노인 돌봄용 위험감지 데이터",
      "다각도 CCTV 생활안전 데이터",
      "생활화학제품 주성분 건강유해성 데이터",
    ]);
    expect(primary.every((item) => item.publicReadbackSources.length > 0)).toBe(true);
  });

  it("builds regional topic seeds that always require fact readback", () => {
    const seeds = buildPolicyTopicSeeds();
    expect(seeds.length).toBe(AIHUB_POLICY_OPPORTUNITIES.length * POLICY_MONITOR_REGIONS.length * 2);
    expect(seeds.every((seed) => seed.needsFactReadback)).toBe(true);
    expect(seeds.map((seed) => seed.title)).toContain("서울특별시 강남구 주민센터 민원 상담 방법");
    expect(seeds.map((seed) => seed.title)).toContain("전라남도 순천시 2026 소상공인 지원사업 제출서류");
  });

  it("builds official readback candidates before draft promotion", () => {
    const [seed] = buildPolicyTopicSeeds(["전라남도 순천시"], AIHUB_POLICY_OPPORTUNITIES.slice(0, 1));
    const candidates = buildPublicReadbackCandidates(seed);

    expect(candidates).toHaveLength(seed.publicReadbackSources.length);
    expect(candidates.every((candidate) => candidate.requiredBeforeDraft)).toBe(true);
    expect(candidates.map((candidate) => candidate.sourceName)).toContain("정부24");
    expect(candidates[0].searchUrl).toContain(encodeURIComponent(seed.title));
  });

  it("exports needs-fact-readback rows as JSON-ready data and CSV", () => {
    const rows = buildPolicyExportRows(buildPolicyTopicSeeds(["서울특별시 강남구"]));
    const csv = buildPolicyExportCsv(rows);

    expect(rows).toHaveLength(AIHUB_POLICY_OPPORTUNITIES.length * 2);
    expect(rows.every((row) => row.status === "needs_fact_readback")).toBe(true);
    expect(rows.every((row) => row.year === 2026)).toBe(true);
    expect(rows.every((row) => row.readbackCandidateCount > 0)).toBe(true);
    expect(csv).toContain("readbackCandidateUrls");
    expect(csv).toContain("서울특별시 강남구 주민센터 민원 상담 방법");
  });
});
