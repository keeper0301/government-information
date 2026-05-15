import { describe, expect, it } from "vitest";
import {
  buildImprovementRecommendations,
  type ImprovementSnapshot,
} from "@/lib/autonomous-ops/improvement-scan";

const base: ImprovementSnapshot = {
  blogQualityFlags24h: 0,
  instagramFailures24h: 0,
  instagramSkips24h: 0,
  naverPendingQueue: 0,
  naverSuccess24h: 0,
  cronFailures24h: 0,
  supportOpenOver24h: 0,
  policyInsightPct: 100,
  snsRuns24h: 1,
  blogPublishRuns24h: 0,
};

describe("buildImprovementRecommendations", () => {
  it("큰 문제가 없으면 low 기본 개선 과제를 반환한다", () => {
    const recs = buildImprovementRecommendations(base);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      area: "growth",
      severity: "low",
    });
  });

  it("블로그 품질 경고 3건 이상은 high 개선 과제로 분류한다", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      blogQualityFlags24h: 3,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "content_quality",
        severity: "high",
      }),
    );
  });

  it("네이버 큐가 쌓이고 성공 발행이 없으면 high 개선 과제로 분류한다", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      naverPendingQueue: 20,
      naverSuccess24h: 0,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "naver_blog",
        severity: "high",
      }),
    );
  });

  it("cron 실패는 high 개선 과제로 분류한다", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      cronFailures24h: 1,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "cron_reliability",
        severity: "high",
      }),
    );
  });

  it("블로그는 발행됐지만 SNS 확산이 없으면 growth 과제를 추가한다", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      blogPublishRuns24h: 2,
      snsRuns24h: 0,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "growth",
        severity: "low",
      }),
    );
  });
});
