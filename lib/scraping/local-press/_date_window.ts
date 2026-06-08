// ============================================================
// 목록 날짜 추출 윈도우 경계 헬퍼 (코드리뷰 P1·P2 2026-06-08)
// ============================================================
// board.es / SI / bbsMsg 목록 파서는 매칭된 글 시작점부터 일정 길이를 잘라
// 그 안에서 첫 날짜를 채택한다. 고정 윈도우는 행 간격이 좁으면 '다음 글' 영역까지
// 먹어 옆 글 날짜를 잘못 가져왔다. 그래서 '다음 글(다른 식별자) 등장 직전'으로
// 끝을 제한한다. 단 같은 행에 동일 식별자 링크가 2개(썸네일+제목)여도 안전하도록
// '현재 seq 와 다른' 식별자가 처음 나오는 위치를 경계로 잡는다.
// ============================================================

/**
 * html 의 fromIndex 이후에서, currentId 와 다른 idKey 식별자가 처음 등장하는 위치.
 * 없으면 -1.
 * @param idKey  식별자 쿼리 키 (예: "list_no", "nttNo", "msg_seq")
 */
export function nextDifferentIdIndex(
  html: string,
  fromIndex: number,
  idKey: string,
  currentId: string,
): number {
  const re = new RegExp(`${idKey}=(\\d+)`, "g");
  re.lastIndex = fromIndex;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== currentId) return m.index;
  }
  return -1;
}
