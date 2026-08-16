import { describe, expect, it } from "vitest";
import { buildInstagramReelsQualityDashboard, type ReelsDashboardPostRow } from "@/lib/admin-instagram-reels-quality";

const GOOD_CONTENT = "대상은 19세부터 34세 청년이며 부모와 따로 거주해야 합니다. 중위소득 150% 이하 기준을 적용합니다. 지원 금액은 월 최대 20만원이며 최대 12개월까지 받을 수 있습니다. 신청 기간은 2026년 7월까지입니다. 복지로 또는 주민센터에서 신청할 수 있고 주민등록등본과 임대차계약서를 제출합니다. 신청 전 임대차계약서 주소와 주민등록 주소가 맞는지 확인해야 합니다. 이미 비슷한 주거 지원을 받고 있으면 중복 제한이 있을 수 있어 공고문을 먼저 확인해야 합니다. 선정 뒤에는 계좌와 거주 상태 확인 절차가 이어질 수 있습니다. 문의는 관할 주민센터 또는 복지로 안내 페이지에서 확인합니다. 이 지원은 실제 거주 여부와 소득 기준을 함께 보기 때문에 신청 전에 가구원, 임대료, 보증금, 계좌 정보를 정리해두는 편이 안전합니다. 마감 이후 접수는 어려울 수 있으니 공고의 접수 기간과 예산 소진 조건을 같이 확인합니다. 온라인 신청이 막히면 주민센터 방문 접수 가능 여부를 담당 기관에 문의합니다. 신청자는 임대차계약서, 주민등록등본, 가족관계증명서, 소득 확인 자료를 준비하고 이름과 계좌 정보가 신청서와 같은지 확인합니다. 선정 결과는 문자나 누리집 공지로 안내될 수 있으며, 지급 전 실제 거주 여부 확인이 추가로 진행될 수 있습니다. 공고 변경이나 예산 조기 소진이 있을 수 있으므로 공식 안내 페이지의 최신 날짜를 다시 확인해야 합니다. 세부 기준은 지자체별로 다를 수 있어 최종 신청 전 담당 기관 공지와 문의처를 확인합니다.";

function post(overrides: Partial<ReelsDashboardPostRow> = {}): ReelsDashboardPostRow {
  return {
    id: "post-1",
    slug: "good-slug",
    title: "2026년 서울 청년 월세 지원 신청 안내",
    content: GOOD_CONTENT,
    meta_description: "소득 조건을 충족한 청년에게 월 최대 20만원을 지원하고 신청 기간, 제출 서류, 주민센터 문의 절차, 공식 공고 확인 방법까지 함께 확인해야 하는 서울 청년 월세 지원 상세 안내입니다.",
    category: "청년 주거",
    tags: ["청년", "월세"],
    published_at: "2026-08-16T00:00:00.000Z",
    admin_review_required: false,
    instagram_reel_video_url: null,
    instagram_reel_published_at: null,
    instagram_reel_media_id: null,
    instagram_reel_error: null,
    instagram_reel_attempt_count: 0,
    instagram_reel_render_attempt_count: 0,
    ...overrides,
  };
}

describe("buildInstagramReelsQualityDashboard", () => {
  it("surfaces ready-to-publish candidates with cap and audio evidence", () => {
    const data = buildInstagramReelsQualityDashboard({
      nowMs: Date.parse("2026-08-16T03:00:00.000Z"),
      env: {
        INSTAGRAM_REELS_RENDER_ENABLED: "true",
        INSTAGRAM_REELS_AUTO_ENABLED: "true",
        INSTAGRAM_REELS_DAILY_CAP: "1",
      },
      posts: [
        post({
          instagram_reel_render_attempt_count: 3,
          instagram_reel_video_url: "https://cdn.keepioo.test/instagram-reels/2026-08/article-source-labels-v19/good.mp4",
        }),
      ],
      actions: [
        {
          action: "instagram_reel_render_success",
          created_at: "2026-08-16T01:00:00.000Z",
          details: { slug: "good-slug", duration_seconds: 15.4 },
        },
      ],
    });

    expect(data.renderEnabled).toBe(true);
    expect(data.publishEnabled).toBe(true);
    expect(data.dailyCap).toBe(1);
    expect(data.counts.readyToPublish).toBe(1);
    expect(data.candidates[0]).toMatchObject({
      status: "ready_to_publish",
      ttsAudioStatus: "verified",
      durationSeconds: 15.4,
      retryExcluded: false,
    });
  });

  it("marks review-blocked and retry-excluded rows explicitly", () => {
    const data = buildInstagramReelsQualityDashboard({
      nowMs: Date.parse("2026-08-16T03:00:00.000Z"),
      env: { INSTAGRAM_REELS_DAILY_CAP: "2" },
      posts: [
        post({ id: "review", slug: "review", admin_review_required: true }),
        post({
          id: "retry",
          slug: "retry",
          instagram_reel_attempt_count: 3,
          instagram_reel_video_url: "https://cdn.keepioo.test/instagram-reels/2026-08/article-source-labels-v19/retry.mp4",
        }),
      ],
      actions: [],
    });

    expect(data.counts.qualityBlocked).toBe(1);
    expect(data.counts.retryExcluded).toBe(1);
    expect(data.candidates.map((candidate) => candidate.status)).toContain("quality_blocked");
    expect(data.candidates.map((candidate) => candidate.status)).toContain("retry_excluded");
  });

  it("computes KST daily cap from the explicit production count when provided", () => {
    const data = buildInstagramReelsQualityDashboard({
      nowMs: Date.parse("2026-08-16T02:00:00.000Z"),
      env: { INSTAGRAM_REELS_DAILY_CAP: "1" },
      todayPublished: 1,
      posts: [post({ id: "visible", slug: "visible" })],
      actions: [],
    });

    expect(data.todayPublished).toBe(1);
    expect(data.dailyCapRemaining).toBe(0);
  });

  it("falls back to fetched rows for KST daily cap in pure reducer tests", () => {
    const data = buildInstagramReelsQualityDashboard({
      nowMs: Date.parse("2026-08-16T02:00:00.000Z"), // KST 11:00, day starts 2026-08-15T15:00Z
      env: { INSTAGRAM_REELS_DAILY_CAP: "1" },
      posts: [
        post({
          id: "published",
          slug: "published",
          instagram_reel_published_at: "2026-08-15T16:00:00.000Z",
          instagram_reel_media_id: "ig-1",
        }),
        post({ id: "old", slug: "old", instagram_reel_published_at: "2026-08-15T14:00:00.000Z" }),
      ],
      actions: [],
    });

    expect(data.todayPublished).toBe(1);
    expect(data.dailyCapRemaining).toBe(0);
    expect(data.counts.published).toBe(2);
  });
});
