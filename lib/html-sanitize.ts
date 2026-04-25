// ============================================================
// HTML sanitize — admin/blog 본문 저장 시 XSS 차단
// ============================================================
// TipTap 에디터가 생성한 HTML 또는 사장님이 HTML 모드로 직접 입력한
// 마크업을 DB 저장 전 sanitize. /blog/[slug] 가 dangerouslySetInnerHTML
// 로 렌더하므로 <script>, on* 핸들러, javascript: URL 차단 필수.
//
// admin (사장님 본인) 만 작성하지만, 향후 기여자·복사붙여넣기 콘텐츠에
// 위험 마크업이 섞일 수 있어 방어선 1줄 추가.
//
// 허용 태그: 워드프레스 클래식 에디터 + TipTap 출력 범위에 맞춤.
//
// 2026-04-25 버그픽스: isomorphic-dompurify → jsdom@29 → parse5(ESM only)
// 체인이 webpack 의 require() 로 로드되며 "Error: require() of ES Module"
// 발생 (admin/blog/[id] 페이지 500). top-level import 면 페이지 GET 로드만
// 해도 평가됨. async dynamic import 로 호출 시점에만 로드해 회피.
// ============================================================

const ALLOWED_TAGS = [
  // 본문 구조
  "p", "br", "hr", "blockquote", "pre",
  // 제목
  "h1", "h2", "h3", "h4", "h5", "h6",
  // 강조·인라인
  "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "code", "kbd", "sub", "sup",
  // 목록
  "ul", "ol", "li",
  // 링크·이미지·미디어 (제한적)
  "a", "img", "figure", "figcaption",
  // 표
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  // 인라인 컨테이너
  "span", "div",
  // 체크리스트 — TaskItem 이 li 안에 input + label 출력
  "input", "label",
  // 유튜브 임베드 — TipTap Youtube extension 이 div+iframe 출력
  "iframe",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",                          // a
  "src", "alt", "width", "height", "loading",       // img
  "class", "id",                                    // 일반
  "colspan", "rowspan",                             // table
  "title",                                          // a / abbr 등
  "style",                                          // text-align / color (DOMPurify 가 위험 style 차단)
  "type", "checked", "disabled",                    // task list 의 input
  "data-checked", "data-type", "data-youtube-video", // TipTap 노드 태깅
  "allowfullscreen", "frameborder",                 // iframe (youtube)
  "align",                                          // 표 / 이미지 정렬 (legacy 호환)
];

// URL 스킴 화이트리스트 — javascript:·data:text/html 등 차단.
// "data:image/" 는 작은 이미지 inline 허용 (TipTap 이 가끔 생성).
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|ftp|sms):|\/|#|data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,)/i;

export async function sanitizeBlogHtml(html: string): Promise<string> {
  if (!html) return "";
  // dynamic import — webpack 의 require() 외부화가 jsdom 의 ESM-only deps
  // (parse5, css-tree, @bramus/specificity) 를 require() 로 로드하다 실패하던
  // 문제 회피. native ESM import 는 ESM 패키지를 정상 로드함.
  const { default: DOMPurify } = await import("isomorphic-dompurify");
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    // 주석은 보통 의미 없고 가끔 conditional comment 로 IE 공격 벡터 → 제거
    ALLOW_DATA_ATTR: false,
    // <a target="_blank"> 자동 rel="noopener noreferrer" 강화
    ADD_ATTR: ["target", "rel"],
  });
}
