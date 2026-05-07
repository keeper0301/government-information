// ============================================================
// 인스타그램 캡션 자동 생성
// ============================================================
// 어드민에서 사장님이 「캡션 복사」 → 인스타 게시 시 paste.
// 인스타 캡션은 최대 2,200자 (실제 가독성은 ~500자 이하 권장).
//
// 구조:
//  1) hook 문장 (제목 기반)
//  2) 핵심 정보 3줄 (자격·금액·마감)
//  3) keepioo 링크 안내 ("프로필 링크 →" 형태, 인스타 캡션 내 링크는 클릭 안 됨)
//  4) 해시태그 (한국 정책 검색 흔한 키워드 + 카테고리)
// ============================================================

export type CaptionInput = {
  title: string;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  /** keepioo 상세 페이지 URL (link in bio 안내용) */
  detailUrl: string;
};

const KEEPIOO_LINK = "https://www.keepioo.com";

/**
 * 카테고리별 기본 해시태그 — 인스타 노출 도움.
 * 사용자가 검색할 만한 한국어 해시태그 위주.
 */
const CATEGORY_HASHTAGS: Record<string, string[]> = {
  청년: ["#청년정책", "#청년지원금", "#청년혜택", "#2026년청년"],
  소상공인: ["#소상공인지원", "#자영업자혜택", "#소상공인대출", "#정책자금"],
  주거: ["#주거지원", "#전세자금대출", "#임대주택", "#주거안정"],
  "육아·가족": ["#육아지원", "#출산장려금", "#양육수당", "#다자녀혜택"],
  노년: ["#노인복지", "#기초연금", "#노인지원", "#어르신혜택"],
  "학생·교육": ["#교육지원", "#학자금", "#학생혜택", "#장학금"],
  문화: ["#문화지원", "#문화바우처", "#예술지원"],
  큐레이션: ["#정책정리", "#복지정보"],
};

const COMMON_HASHTAGS = [
  "#정책알리미",
  "#정부지원금",
  "#복지정책",
  "#내가받을수있는정책",
];

export function buildInstagramCaption(input: CaptionInput): string {
  const lines: string[] = [];

  // 1) Hook — 제목 그대로 (이미 CTR 강화된 prompt 결과)
  lines.push(`📌 ${input.title}`);
  lines.push("");

  // 2) 핵심 정보 — meta_description 활용
  if (input.meta_description) {
    lines.push(input.meta_description.trim());
    lines.push("");
  }

  // 3) keepioo 안내 (인스타 캡션 link 클릭 안 되므로 "프로필 링크" 가이드)
  lines.push("👉 자세한 자격·금액·신청 방법은 프로필 링크 (keepioo.com) 에서 확인하세요!");
  lines.push("👉 1분 자격 진단으로 사장님이 받을 수 있는 정책을 즉시 확인 →");
  lines.push("");

  // 4) 해시태그 — 카테고리 기반 + 공통 + 사용자 tags
  const categoryTags = input.category
    ? CATEGORY_HASHTAGS[input.category] ?? []
    : [];
  const userTags = (input.tags ?? []).map((t) =>
    `#${t.replace(/\s+/g, "").replace(/^#/, "")}`,
  );
  const allTags = [...new Set([...categoryTags, ...COMMON_HASHTAGS, ...userTags])];
  lines.push(allTags.slice(0, 12).join(" ")); // 인스타 권장 8~12개

  return lines.join("\n").trim();
}

/**
 * 인스타 첫 게시 시 사장님이 프로필에 1회만 붙여넣을 link in bio 텍스트.
 * 캡션과 별도로 안내.
 */
export function getLinkInBioText(): string {
  return `${KEEPIOO_LINK} - 1분 자격 진단으로 정부 지원금 즉시 확인`;
}
