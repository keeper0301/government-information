import { describe, expect, it } from "vitest";
import {
  buildDeliveryHref,
  buildNotificationHistoryUrl,
  getDeliveryReasonSignals,
  getDeliveryStatusMeta,
  groupDeliveryPolicyIds,
  normalizeHistorySearchParams,
  periodToStartIso,
  statusToDb,
  type NotificationDelivery,
  type NotificationPolicy,
} from "@/lib/notifications/history-inbox";
import type { UserSignals } from "@/lib/personalization/types";

const baseDelivery: NotificationDelivery = {
  id: "delivery-1",
  program_table: "welfare_programs",
  program_id: "policy-1",
  program_title: "순천 매월리 주거 지원",
  channel: "email",
  status: "sent",
  error: null,
  sent_at: "2026-05-20T03:00:00.000Z",
  created_at: "2026-05-20T03:00:00.000Z",
};

const baseUser: UserSignals = {
  ageGroup: null,
  region: "전남" as UserSignals["region"],
  district: "순천시",
  subDistrict: "매월리",
  occupation: null,
  incomeLevel: "low",
  householdTypes: ["single_parent"],
  benefitTags: ["주거" as UserSignals["benefitTags"][number]],
  hasChildren: true,
  merit: null,
  businessProfile: null,
};

describe("notification history inbox helpers", () => {
  it("normalizes filters and pagination", () => {
    expect(
      normalizeHistorySearchParams({
        page: "-5",
        status: "pending",
        period: "all",
        q: "  청년 주거 ".repeat(20),
      }),
    ).toMatchObject({
      page: 1,
      offset: 0,
      statusParam: "pending",
      periodParam: "all",
      q: expect.stringMatching(/^청년 주거/),
    });

    expect(
      normalizeHistorySearchParams({
        page: "3",
        status: "unknown",
        period: "broken",
      }),
    ).toEqual({
      page: 3,
      offset: 60,
      statusParam: "all",
      periodParam: "30d",
      q: undefined,
    });
  });

  it("maps URL status and periods to query values", () => {
    expect(statusToDb("sent")).toBe("sent");
    expect(statusToDb("failed")).toBe("failed");
    expect(statusToDb("pending")).toBe("queued");
    expect(statusToDb("all")).toBeNull();

    expect(periodToStartIso("all", new Date("2026-05-21T00:00:00.000Z"))).toBeNull();
    expect(periodToStartIso("7d", new Date("2026-05-21T00:00:00.000Z"))).toBe(
      "2026-05-14T00:00:00.000Z",
    );
  });

  it("builds stable filter URLs and omits page one", () => {
    const state = normalizeHistorySearchParams({
      page: "4",
      status: "failed",
      period: "7d",
      q: "주거",
    });

    expect(buildNotificationHistoryUrl(state, { page: "1" })).toBe(
      "/mypage/notifications/history?status=failed&period=7d&q=%EC%A3%BC%EA%B1%B0",
    );
    expect(buildNotificationHistoryUrl(state, { status: "all", page: "2" })).toBe(
      "/mypage/notifications/history?page=2&period=7d&q=%EC%A3%BC%EA%B1%B0",
    );
  });

  it("groups supported delivery policy ids and builds policy hrefs", () => {
    const deliveries: NotificationDelivery[] = [
      baseDelivery,
      { ...baseDelivery, id: "delivery-2", program_table: "loan_programs", program_id: "loan-1" },
      { ...baseDelivery, id: "delivery-3", program_table: "news", program_id: "news-1" },
      { ...baseDelivery, id: "delivery-4", program_id: "policy-1" },
    ];

    expect(groupDeliveryPolicyIds(deliveries)).toEqual({
      welfareIds: ["policy-1"],
      loanIds: ["loan-1"],
    });
    expect(buildDeliveryHref(deliveries[0])).toBe("/welfare/policy-1");
    expect(buildDeliveryHref(deliveries[1])).toBe("/loan/loan-1");
    expect(buildDeliveryHref(deliveries[2])).toBe("/policy");
  });

  it("returns display metadata for delivery statuses", () => {
    expect(getDeliveryStatusMeta("sent")).toMatchObject({ label: "도착", tone: "success" });
    expect(getDeliveryStatusMeta("failed")).toMatchObject({ label: "실패", tone: "danger" });
    expect(getDeliveryStatusMeta("queued")).toMatchObject({ label: "대기", tone: "warning" });
    expect(getDeliveryStatusMeta("skipped")).toMatchObject({ label: "제외", tone: "neutral" });
  });

  it("scores a linked policy against the user profile for reason chips", () => {
    const policy: NotificationPolicy = {
      id: "policy-1",
      title: "순천시 매월리 한부모 주거 지원",
      target: "한부모 가구",
      description: "매월리 저소득 한부모 가구 주거비 지원",
      eligibility: null,
      detailed_content: null,
      region: "전남",
      district: "순천시",
      sub_district: "매월리",
      benefit_tags: ["주거"],
      apply_end: "2999-12-31",
      source: "test",
      income_target_level: "low",
      household_target_tags: ["single_parent"],
    };

    const reasons = getDeliveryReasonSignals(policy, baseUser).map((signal) => signal.kind);

    expect(reasons).toEqual(
      expect.arrayContaining([
        "region",
        "district",
        "sub_district",
        "benefit_tags",
        "income_target",
        "household_target",
      ]),
    );
  });
});
