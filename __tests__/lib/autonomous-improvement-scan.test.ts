import { describe, expect, it } from "vitest";
import {
  buildImprovementRecommendations,
  parseImprovementScanRow,
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
  qualityImprovementHints: [],
  externalQualityPending: 0,
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

  it("품질 검수에서 나온 구체 개선 포인트를 추천 액션에 반영한다", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      blogQualityFlags24h: 1,
      qualityImprovementHints: ["신청 기간을 첫 단락에 추가", "공식 신청 링크 확인 문구 추가"],
    });
    const contentRec = recs.find((r) => r.area === "content_quality");
    expect(contentRec?.action).toContain("신청 기간을 첫 단락에 추가");
    expect(contentRec?.action).toContain("공식 신청 링크 확인 문구 추가");
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

  it("외부 발행 품질 대기가 많으면 high 개선 과제로 분류한다", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      externalQualityPending: 5,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "content_quality",
        severity: "high",
        title: "품질 검수 대기 때문에 외부 발행이 막혀 있습니다",
      }),
    );
  });

  // ── severity 정렬 검증 ──────────────────────────────────────
  // ImprovementPanel 이 첫 4건만 표시. high 가 항상 앞에 와야
  // 사장님이 우선순위 액션을 놓치지 않음.

  it("high·medium·low 가 섞이면 severity 순으로 정렬", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      blogQualityFlags24h: 3, // content_quality high
      naverPendingQueue: 15, // naver_blog medium
      blogPublishRuns24h: 2, // growth low
      snsRuns24h: 0,
    });
    // high · medium · low 순서 보장
    const severities = recs.map((r) => r.severity);
    const highIdx = severities.indexOf("high");
    const mediumIdx = severities.indexOf("medium");
    const lowIdx = severities.indexOf("low");
    expect(highIdx).toBeGreaterThanOrEqual(0);
    expect(mediumIdx).toBeGreaterThan(highIdx);
    expect(lowIdx).toBeGreaterThan(mediumIdx);
  });

  it("같은 severity 안에서는 원래 코드 순서 유지 (stable sort)", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      naverPendingQueue: 20, // naver_blog high
      naverSuccess24h: 0,
      cronFailures24h: 1, // cron_reliability high
    });
    // 두 high 모두 존재 + buildImprovementRecommendations 코드 순서가 naver → cron
    const highs = recs.filter((r) => r.severity === "high");
    expect(highs.length).toBeGreaterThanOrEqual(2);
    const naverIdx = highs.findIndex((r) => r.area === "naver_blog");
    const cronIdx = highs.findIndex((r) => r.area === "cron_reliability");
    expect(naverIdx).toBeLessThan(cronIdx);
  });

  it("recommendations 가 1건일 때도 정렬 정상 동작", () => {
    const recs = buildImprovementRecommendations(base);
    expect(recs).toHaveLength(1);
    expect(recs[0].severity).toBe("low");
  });

  // ── 2026-05-18~19 신규 분기 (5/18 사고 학습 환류) ────
  it("외부 액션 잔여 3건 이상 → high severity", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      pendingExternalActionsCount: 3,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "growth",
        severity: "high",
        title: expect.stringContaining("외부 액션"),
      }),
    );
  });

  it("외부 액션 잔여 1~2건 → medium severity", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      pendingExternalActionsCount: 1,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "growth",
        severity: "medium",
        title: expect.stringContaining("외부 액션"),
      }),
    );
  });

  it("blogBodyAnomaly true → high content_quality (5/18 OpenAI 사고 패턴)", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      blogBodyAnomaly: true,
      blogBodyAvgChars24h: 800,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "content_quality",
        severity: "high",
        title: expect.stringContaining("본문 평균"),
        action: expect.stringContaining("lib/ai.ts"),
      }),
    );
  });

  it("naverExtensionIdle true → medium naver_blog", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      naverExtensionIdle: true,
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "naver_blog",
        severity: "medium",
        title: expect.stringContaining("Naver Extension"),
      }),
    );
  });

  it("agentDiagnoseRuns24h < 300 → medium cron_reliability (Render free cold start)", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      agentDiagnoseRuns24h: 159, // 5/18 측정값
    });
    expect(recs).toContainEqual(
      expect.objectContaining({
        area: "cron_reliability",
        severity: "medium",
        title: expect.stringContaining("Codex agent cycle"),
        action: expect.stringContaining("Render Starter"),
      }),
    );
  });

  it("agentDiagnoseRuns24h ≥ 300 → cron_reliability 추천 X (정상 cycle)", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      agentDiagnoseRuns24h: 400,
    });
    expect(recs.find((r) => r.title.includes("Codex agent cycle"))).toBeUndefined();
  });

  it("agentDiagnoseRuns24h = 0 → 추천 X (cron 첫 가동 또는 sidecar 미가동, false positive 차단)", () => {
    const recs = buildImprovementRecommendations({
      ...base,
      agentDiagnoseRuns24h: 0,
    });
    expect(recs.find((r) => r.title.includes("Codex agent cycle"))).toBeUndefined();
  });
});

// ── parseImprovementScanRow (getLatest + getPrevious 공유 헬퍼) ────
describe("parseImprovementScanRow", () => {
  it("정상 row → ImprovementScanRun 반환", () => {
    const row = {
      created_at: "2026-05-16T10:20:00Z",
      details: {
        highestSeverity: "high",
        snapshot: {
          blogQualityFlags24h: 3,
          instagramFailures24h: 0,
          instagramSkips24h: 0,
          naverPendingQueue: 0,
          naverSuccess24h: 0,
          cronFailures24h: 0,
          supportOpenOver24h: 0,
          policyInsightPct: 100,
          snsRuns24h: 1,
          blogPublishRuns24h: 0,
          qualityImprovementHints: [],
          externalQualityPending: 0,
        },
        recommendations: [
          {
            area: "content_quality",
            severity: "high",
            title: "블로그 품질 경고가 많습니다",
            evidence: "24시간 품질 경고 3건",
            action: "/admin/blog 에서 확인",
          },
        ],
      },
    };
    const parsed = parseImprovementScanRow(row);
    expect(parsed).not.toBeNull();
    expect(parsed?.createdAt).toBe("2026-05-16T10:20:00Z");
    expect(parsed?.highestSeverity).toBe("high");
    expect(parsed?.recommendations).toHaveLength(1);
  });

  it("details 가 object 아니면 null", () => {
    expect(
      parseImprovementScanRow({
        created_at: "2026-05-16T10:20:00Z",
        details: null,
      }),
    ).toBeNull();
    expect(
      parseImprovementScanRow({
        created_at: "2026-05-16T10:20:00Z",
        details: "string-not-object",
      }),
    ).toBeNull();
  });

  it("recommendations 가 array 아니면 빈 배열", () => {
    const parsed = parseImprovementScanRow({
      created_at: "2026-05-16T10:20:00Z",
      details: {
        highestSeverity: "low",
        snapshot: {},
        recommendations: "not-array",
      },
    });
    expect(parsed?.recommendations).toEqual([]);
  });

  it("created_at 이 null 이면 빈 문자열 fallback", () => {
    const parsed = parseImprovementScanRow({
      created_at: null,
      details: { highestSeverity: "low", snapshot: {}, recommendations: [] },
    });
    expect(parsed?.createdAt).toBe("");
  });

  it("highestSeverity 가 잘못된 값이면 'low' fallback", () => {
    const parsed = parseImprovementScanRow({
      created_at: "2026-05-16T10:20:00Z",
      details: {
        highestSeverity: "critical", // 잘못된 값
        snapshot: {},
        recommendations: [],
      },
    });
    expect(parsed?.highestSeverity).toBe("low");
  });

  it("저장된 scan row 에 중복 추천이 있으면 같은 액션은 1건으로 정리한다", () => {
    const action = "/admin/cron-failures 에서 실패 job을 확인하고 failed-cron-retry 결과와 Vercel function 로그를 대조하세요.";
    const parsed = parseImprovementScanRow({
      created_at: "2026-06-15T05:21:22Z",
      details: {
        highestSeverity: "high",
        snapshot: {},
        recommendations: [
          {
            area: "cron_reliability",
            severity: "high",
            title: "최근 cron 실패가 있습니다",
            evidence: "24시간 cron 실패 1건",
            action,
          },
          {
            area: "cron_reliability",
            severity: "high",
            title: "최근 cron 실패가 있습니다",
            evidence: "24시간 cron 실패 8건",
            action,
          },
          {
            area: "cron_reliability",
            severity: "high",
            title: "최근 cron 실패가 있습니다",
            evidence: "24시간 cron 실패 2건",
            action,
          },
        ],
      },
    });
    expect(parsed?.recommendations).toHaveLength(1);
    expect(parsed?.recommendations[0]).toMatchObject({
      area: "cron_reliability",
      evidence: "24시간 cron 실패 8건",
    });
  });
});
