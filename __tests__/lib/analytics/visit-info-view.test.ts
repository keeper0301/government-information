import { describe, expect, it } from "vitest";
import {
  MIN_VISIT_INFO_VISIBLE_PX,
  reduceVisitInfoView,
  type VisitInfoViewState,
} from "@/lib/analytics/visit-info-view";

const initial: VisitInfoViewState = { scrolled: false, visible: false, recorded: false };

describe("방문 안내 조회는 마운트·즉시 교차가 아니라 사용자가 본 뒤에만 기록한다", () => {
  it("처음 화면에 보여도 스크롤 전에는 기록하지 않는다", () => {
    const result = reduceVisitInfoView(initial, { type: "visibility", visible: true });
    expect(result.record).toBe(false);
    expect(result.state.recorded).toBe(false);
    expect(result.state.visible).toBe(true);
  });

  it("화면 밖에 있다가 사용자가 스크롤해 들어오면 한 번 기록한다", () => {
    const hidden = reduceVisitInfoView(initial, { type: "visibility", visible: false });
    const scrolled = reduceVisitInfoView(hidden.state, { type: "scroll" });
    expect(scrolled.record).toBe(false);

    const shown = reduceVisitInfoView(scrolled.state, { type: "visibility", visible: true });
    expect(shown.record).toBe(true);
    expect(shown.state.recorded).toBe(true);

    const again = reduceVisitInfoView(shown.state, { type: "visibility", visible: true });
    expect(again.record).toBe(false);
  });

  it("처음부터 보이는 구간은 사용자가 스크롤한 뒤에만 기록한다", () => {
    const shown = reduceVisitInfoView(initial, { type: "visibility", visible: true });
    const scrolled = reduceVisitInfoView(shown.state, { type: "scroll" });
    expect(scrolled.record).toBe(true);
    expect(reduceVisitInfoView(scrolled.state, { type: "scroll" }).record).toBe(false);
  });

  it("아직 보이지 않을 때 스크롤만으로는 기록하지 않는다", () => {
    const hidden = reduceVisitInfoView(initial, { type: "visibility", visible: false });
    expect(reduceVisitInfoView(hidden.state, { type: "scroll" }).record).toBe(false);
  });

  it("가시 높이는 한 줄 스침이 아니라 안내 본문이 들어온 높이다", () => {
    expect(MIN_VISIT_INFO_VISIBLE_PX).toBeGreaterThanOrEqual(48);
  });
});
