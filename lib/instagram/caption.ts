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

import { validateCaption } from "../validate-caption";

export function buildInstagramCaption(input: CaptionInput): string {
  const lines: string[] = [];

  // 1) Hook — 제목 그대로 (이미 CTR 강화된 prompt 결과)
  lines.push(`📌 ${input.title}`);
  lines.push("놓치기 쉬운 지원 조건은 저장해두고 다시 확인하세요.");
  lines.push("");

  // 2) 핵심 정보 — meta_description 활용
  if (input.meta_description) {
    lines.push(input.meta_description.trim());
    lines.push("");
  }

  // 3) keepioo 안내 (인스타 캡션 link 클릭 안 되므로 "프로필 링크" 가이드)
  lines.push("✅ 확인할 것: 대상·소득 기준·신청 기간·제출 서류");
  lines.push("⚠️ 실제 자격과 금액은 지역·소득·마감일에 따라 달라질 수 있어요.");
  lines.push("👉 자세한 자격·금액·신청 방법은 프로필 링크 (keepioo.com) 에서 확인하세요!");
  lines.push(`👉 keepioo에서 "${input.title.slice(0, 28)}" 검색`);
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

  const caption = lines.join("\n").trim();
  // 5/22: AI 티 자동 검증 — 위반 시 throw → 자동 cron 발행 차단.
  // meta_description LLM 결과가 금지 패턴 포함 시 발행 X.
  //
  // 2026-06-13 오탐 수정: 검증은 keepioo 자체 문체(프로스·meta_description)를 잡는 것이지,
  // 캡션이 그대로 인용하는 정책 제목(고유명사)을 막으려는 게 아니다. 제목에 금지 문구가
  // 들어 있으면(예: "청년과 함께 성장할 기업 모집" → 금지구 "함께 성장") 그 글이 매번 검증
  // 실패해 영영 미발행되던 사고(6/8 admin_actions instagram_publish_fail) → 검증 직전 제목을
  // 제거한 텍스트로 검사. 제목은 hook(📌)·검색안내("…") 2곳에 들어가며 후자는 28자 절단형이라 둘 다 제거.
  const titleParts = [...new Set([input.title, input.title.slice(0, 28)])].filter(
    Boolean,
  );
  let checkable = caption;
  for (const part of titleParts) checkable = checkable.split(part).join(" ");
  validateCaption(checkable, { source: "instagram-caption" });
  return caption;
}

/**
 * 인스타 첫 게시 시 사장님이 프로필에 1회만 붙여넣을 link in bio 텍스트.
 * 캡션과 별도로 안내.
 */
export function getLinkInBioText(): string {
  return `${KEEPIOO_LINK} - 1분 자격 진단으로 정부 지원금 즉시 확인`;
}
