import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetPolicyDetailFunnelForTests,
  trackPolicyDetailEvent,
} from "@/lib/analytics/policy-detail-events";

const detail = {
  programId: "ae7c4623-0000-4000-8000-000000000001",
  programTable: "welfare_programs" as const,
  sourcePage: "/welfare/ae7c4623-0000-4000-8000-000000000001",
};

function beaconBodies(): unknown[] {
  const sendBeacon = navigator.sendBeacon as ReturnType<typeof vi.fn>;
  return sendBeacon.mock.calls.map((call) => JSON.parse(String(call[1])));
}

function fetchBodies(): unknown[] {
  return vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
}

describe("정책 상세 이벤트 전송", () => {
  afterEach(() => {
    resetPolicyDetailFunnelForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("전화·외부 신청·알림톡 클릭은 sendBeacon 으로 페이지를 떠나도 남긴다", () => {
    const sendBeacon = vi.fn(() => true);
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    vi.stubGlobal("fetch", fetchMock);
    const gtag = vi.fn();
    vi.stubGlobal("gtag", undefined);
    Object.defineProperty(window, "gtag", { value: gtag, configurable: true });

    trackPolicyDetailEvent({ ...detail, eventType: "apply_call_click" });
    trackPolicyDetailEvent({ ...detail, eventType: "apply_click" });
    trackPolicyDetailEvent({ ...detail, eventType: "alimtalk_signup_click" });

    expect(sendBeacon).toHaveBeenCalledTimes(3);
    expect(fetchMock).not.toHaveBeenCalled();
    for (const body of beaconBodies()) {
      expect(body).toMatchObject({
        program_id: detail.programId,
        program_table: detail.programTable,
        source_page: detail.sourcePage,
      });
    }
    expect(beaconBodies().map((body) => (body as { event_type: string }).event_type)).toEqual([
      "apply_call_click",
      "apply_click",
      "alimtalk_signup_click",
    ]);
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "apply_call_click",
      expect.objectContaining({
        program_id: detail.programId,
        policy_id: detail.programId,
        program_table: detail.programTable,
        source_page: detail.sourcePage,
        transport_type: "beacon",
      }),
    );
  });

  it("sendBeacon 이 거절하면 keepalive fetch 로 같은 본문을 보낸다", () => {
    const sendBeacon = vi.fn(() => false);
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "gtag", { value: undefined, configurable: true });

    trackPolicyDetailEvent({ ...detail, eventType: "apply_call_click" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/track",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          event_type: "apply_call_click",
          program_id: detail.programId,
          program_table: detail.programTable,
          source_page: detail.sourcePage,
        }),
        keepalive: true,
      }),
    );
  });

  it("방문 안내를 본 뒤의 신청 링크·전화 클릭은 같은 program_id 의 후속 퍼널이다", () => {
    const sendBeacon = vi.fn(() => true);
    const fetchMock = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    vi.stubGlobal("fetch", fetchMock);
    const gtag = vi.fn();
    Object.defineProperty(window, "gtag", { value: gtag, configurable: true });

    trackPolicyDetailEvent({ ...detail, eventType: "apply_visit_info_view" });
    trackPolicyDetailEvent({ ...detail, eventType: "apply_click" });
    trackPolicyDetailEvent({ ...detail, eventType: "apply_call_click" });

    expect(fetchBodies()[0]).toMatchObject({
      event_type: "apply_visit_info_view",
      program_id: detail.programId,
      program_table: detail.programTable,
      source_page: detail.sourcePage,
    });
    for (const body of beaconBodies()) {
      expect(body).toMatchObject({
        program_id: detail.programId,
        program_table: detail.programTable,
        source_page: detail.sourcePage,
        prior_event: "apply_visit_info_view",
      });
    }
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "apply_click",
      expect.objectContaining({
        program_id: detail.programId,
        policy_id: detail.programId,
        prior_event: "apply_visit_info_view",
        transport_type: "beacon",
      }),
    );
  });

  it("방문 안내를 보기 전의 클릭에는 후속 표시를 붙이지 않는다", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response())));
    Object.defineProperty(window, "gtag", { value: vi.fn(), configurable: true });

    trackPolicyDetailEvent({ ...detail, eventType: "apply_call_click" });

    expect(beaconBodies()[0]).not.toHaveProperty("prior_event");
  });
});
