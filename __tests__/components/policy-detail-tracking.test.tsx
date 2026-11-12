import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { ApplyBottomBar } from "@/components/policy/apply-bottom-bar";
import { ApplyClickTracker } from "@/components/analytics/apply-click-tracker";
import { PhoneClickLink } from "@/components/analytics/phone-click-link";
import { VisitInfoTracker } from "@/components/policy/visit-info-tracker";
import { resetPolicyDetailFunnelForTests } from "@/lib/analytics/policy-detail-events";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () => new Promise(() => {}),
      signInWithOAuth: () => new Promise(() => {}),
    },
  }),
}));

type Entry = { isIntersecting: boolean; intersectionRect: { height: number } };
type ObserverRecord = {
  callback: (entries: Entry[]) => void;
  disconnect: ReturnType<typeof vi.fn>;
};

const observers: ObserverRecord[] = [];

class MockIntersectionObserver {
  callback: (entries: Entry[]) => void;
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];

  constructor(callback: (entries: Entry[]) => void) {
    this.callback = callback;
    observers.push(this);
  }
}

const detail = {
  programId: "ae7c4623-0000-4000-8000-000000000001",
  programTable: "welfare_programs" as const,
  sourcePage: "/welfare/ae7c4623-0000-4000-8000-000000000001",
};

let container: HTMLDivElement;
let root: Root;
const sendBeacon = vi.fn<(url: string, body?: BodyInit | null) => boolean>(() => true);
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  () => Promise.resolve(new Response(null, { status: 200 })),
);

function click(element: Element | null | undefined) {
  if (!element) return;
  element.addEventListener("click", (event) => event.preventDefault(), { capture: true });
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function beaconEvents(): Array<Record<string, unknown>> {
  return sendBeacon.mock.calls.map((call) => JSON.parse(String(call[1])) as Record<string, unknown>);
}

function fetchEvents(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).includes("/api/events/track"))
    .map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>);
}

beforeEach(() => {
  observers.length = 0;
  sendBeacon.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });
  Object.defineProperty(window, "gtag", { value: vi.fn(), configurable: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetPolicyDetailFunnelForTests();
  vi.unstubAllGlobals();
});

describe("전화 신청과 알림톡 버튼", () => {
  it("tel: 링크 클릭이 apply_call_click 과 program_id 를 beacon 으로 보낸다", () => {
    act(() => {
      root.render(
        <PhoneClickLink {...detail} href="tel:0324505388">
          📞 계양구청 노인장애인과 032-450-5388
        </PhoneClickLink>,
      );
    });

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("tel:0324505388");
    click(link);

    expect(beaconEvents()).toEqual([
      expect.objectContaining({
        event_type: "apply_call_click",
        program_id: detail.programId,
        program_table: detail.programTable,
        source_page: detail.sourcePage,
      }),
    ]);
    expect(fetchEvents()).toEqual([]);
  });

  it("하단 알림톡 버튼은 로그인 이동 전에 alimtalk_signup_click 을 beacon 으로 보낸다", () => {
    act(() => {
      root.render(
        <ApplyBottomBar
          {...detail}
          primary={{ type: "alimtalk", label: "신청 방법 알림톡 받기" }}
          secondary={{ type: "phone", tel: "tel:0324505388", label: "전화 문의", display: "032-450-5388" }}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("신청 방법 알림톡 받기"),
    );
    expect(button).toBeTruthy();
    click(button);

    expect(beaconEvents()).toEqual([
      expect.objectContaining({
        event_type: "alimtalk_signup_click",
        program_id: detail.programId,
      }),
    ]);
  });

  it("하단 전화 문의도 같은 전화 클릭 이벤트를 보낸다", () => {
    act(() => {
      root.render(
        <ApplyBottomBar
          {...detail}
          primary={{ type: "alimtalk", label: "신청 방법 알림톡 받기" }}
          secondary={{ type: "phone", tel: "tel:0324505388", label: "전화 문의", display: "032-450-5388" }}
        />,
      );
    });

    const phone = Array.from(container.querySelectorAll("a")).find((node) => node.textContent?.includes("전화 문의"));
    expect(phone?.getAttribute("href")).toBe("tel:0324505388");
    click(phone);

    expect(beaconEvents()[0]).toMatchObject({
      event_type: "apply_call_click",
      program_id: detail.programId,
    });
  });

  it("외부 신청 링크 클릭은 apply_click 과 program_id 를 beacon 으로 보낸다", () => {
    act(() => {
      root.render(
        <ApplyClickTracker {...detail} href="https://www.bokjiro.go.kr/apply/1">
          공식 사이트에서 신청하기 ↗
        </ApplyClickTracker>,
      );
    });

    click(container.querySelector("a"));

    expect(beaconEvents()[0]).toMatchObject({
      event_type: "apply_click",
      program_id: detail.programId,
      source_page: detail.sourcePage,
    });
  });
});

describe("방문 안내 조회", () => {
  it("마운트와 첫 교차 관찰만으로는 apply_visit_info_view 를 보내지 않는다", () => {
    act(() => {
      root.render(
        <VisitInfoTracker {...detail}>
          <p>가까운 동 행정복지센터에 방문</p>
        </VisitInfoTracker>,
      );
    });

    act(() => {
      observers[0]?.callback([{ isIntersecting: true, intersectionRect: { height: 160 } }]);
    });

    expect(fetchEvents()).toEqual([]);
    expect(beaconEvents()).toEqual([]);
  });

  it("사용자가 안내를 스크롤해 보면 한 번만 기록하고, 이후 신청·전화는 후속 퍼널이다", () => {
    act(() => {
      root.render(
        <div>
          <VisitInfoTracker {...detail}>
            <p>가까운 동 행정복지센터에 방문</p>
            <PhoneClickLink {...detail} href="tel:0324505388">
              📞 032-450-5388
            </PhoneClickLink>
            <ApplyClickTracker {...detail} href="https://www.bokjiro.go.kr/apply/1">
              공식 사이트에서 신청하기 ↗
            </ApplyClickTracker>
          </VisitInfoTracker>
        </div>,
      );
    });

    act(() => {
      observers[0]?.callback([{ isIntersecting: false, intersectionRect: { height: 0 } }]);
    });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(fetchEvents()).toEqual([]);

    act(() => {
      observers[0]?.callback([{ isIntersecting: true, intersectionRect: { height: 120 } }]);
    });
    act(() => {
      observers[0]?.callback([{ isIntersecting: true, intersectionRect: { height: 140 } }]);
    });

    expect(fetchEvents()).toEqual([
      expect.objectContaining({
        event_type: "apply_visit_info_view",
        program_id: detail.programId,
        program_table: detail.programTable,
        source_page: detail.sourcePage,
      }),
    ]);

    const links = container.querySelectorAll("a");
    click(links[1]);
    click(links[0]);

    const followOns = beaconEvents();
    expect(followOns).toEqual([
      expect.objectContaining({
        event_type: "apply_click",
        program_id: detail.programId,
        prior_event: "apply_visit_info_view",
      }),
      expect.objectContaining({
        event_type: "apply_call_click",
        program_id: detail.programId,
        prior_event: "apply_visit_info_view",
      }),
    ]);
  });
});
