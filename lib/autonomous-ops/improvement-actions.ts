// ============================================================
// improvement action 텍스트 → 클릭 가능한 segments 변환
// ============================================================
// ImprovementPanel 의 권장 액션 텍스트 안에 /admin/foo 경로가 포함되면
// 사장님이 텍스트만 보고 어디로 가야 하는지 알아내야 함. 자동 추출해서
// 인라인 link 로 변환 → 1 클릭 운영 가속.
//
// 안전한 fallback: 경로 없는 텍스트는 그대로 단일 text segment.
// ============================================================

export type ActionSegment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string };

// /admin/x 또는 /admin/x/y 형식 (소문자·하이픈 한정). 끝에 공백·문장부호 만남.
// /admin 단독 (대시보드) 도 포함.
const ADMIN_PATH_REGEX = /\/admin(?:\/[a-z][a-z0-9-]*)*(?=$|[\s.,·)、])/g;

/**
 * action 텍스트를 segments 배열로 분할.
 *
 * 예: "/admin/instagram 에서 OAuth ..."
 *   → [{ type: "link", href: "/admin/instagram" }, { type: "text", value: " 에서 OAuth ..." }]
 *
 * 경로가 없는 텍스트는 단일 text segment 반환.
 */
export function parseActionSegments(action: string): ActionSegment[] {
  const segments: ActionSegment[] = [];
  let lastIndex = 0;

  // exec 루프 — 매칭된 path 와 그 사이 텍스트 분리
  let match: RegExpExecArray | null;
  const re = new RegExp(ADMIN_PATH_REGEX.source, "g");
  while ((match = re.exec(action)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      segments.push({ type: "text", value: action.slice(lastIndex, start) });
    }
    segments.push({
      type: "link",
      href: match[0],
      label: match[0],
    });
    lastIndex = end;
  }
  if (lastIndex < action.length) {
    segments.push({ type: "text", value: action.slice(lastIndex) });
  }

  // 매칭 0 회 — 단일 text segment 로 fallback
  if (segments.length === 0) {
    segments.push({ type: "text", value: action });
  }

  return segments;
}

// 텍스트 안에 admin path 1개 이상 있는지 — UI 에서 link 모드 / plain text 모드 분기 시 사용
export function actionHasLinks(action: string): boolean {
  return new RegExp(ADMIN_PATH_REGEX.source).test(action);
}
