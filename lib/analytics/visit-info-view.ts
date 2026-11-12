// 방문 신청 안내가 실제로 보였는지 판정한다.
// 마운트 직후 교차 관찰(이미 화면 안에 있는 경우 포함)은 조회가 아니다.
// 사용자가 스크롤한 뒤 안내 본문이 충분히 보일 때만 한 번 기록한다.

export const MIN_VISIT_INFO_VISIBLE_PX = 80;

export type VisitInfoViewState = {
  scrolled: boolean;
  visible: boolean;
  recorded: boolean;
};

export type VisitInfoViewEvent =
  | { type: "visibility"; visible: boolean }
  | { type: "scroll" };

export function isVisitInfoVisible(entry: {
  isIntersecting: boolean;
  intersectionRect?: { height: number } | null;
}): boolean {
  if (!entry.isIntersecting) return false;
  return (entry.intersectionRect?.height ?? 0) >= MIN_VISIT_INFO_VISIBLE_PX;
}

export function reduceVisitInfoView(
  state: VisitInfoViewState,
  event: VisitInfoViewEvent,
): { state: VisitInfoViewState; record: boolean } {
  if (state.recorded) return { state, record: false };

  if (event.type === "visibility") {
    if (!state.scrolled) {
      return { state: { ...state, visible: event.visible }, record: false };
    }
    if (event.visible) {
      return { state: { scrolled: true, visible: true, recorded: true }, record: true };
    }
    return { state: { ...state, visible: false }, record: false };
  }

  if (state.visible) {
    return { state: { scrolled: true, visible: true, recorded: true }, record: true };
  }
  return { state: { ...state, scrolled: true }, record: false };
}
