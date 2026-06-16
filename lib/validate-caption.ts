// ============================================================
// 캡션 AI 티 자동 검증 (2026-05-22 keepio_agent 동기화)
// ============================================================
// 사장님 5/22 피드백 (keepio_agent CLAUDE.md "캡션 작성 룰"):
//   keepioo_official 발행 글 매번 같은 양식 반복 + AI 티 강함.
//   "여러분 / 제가 말하고 싶은 건 / 먼저 볼 건 딱 / 나중에 / 해당될까 싶으면"
//   정형 양식 + R&amp;D HTML entity 미디코드 = 신뢰도 직접 영향.
//
// 호출처 (모든 SNS·인스타 발행 path 단일 차단점):
//   - lib/instagram/caption.ts buildInstagramCaption() return 직전
//   - lib/sns/threads.ts publishThreadsPost() 시작
//   - lib/sns/dispatch.ts dispatchBlogToSns() 호출 전
//   - lib/sns/policy-dispatch.ts dispatchPolicyToSns() 호출 전
//
// 위반 시 throw → 자동 발행 cron 차단. 사장님 검토 후 caption 수정 필요.
// ============================================================

// 1. 즉시 차단 금지 phrase (사장님 5/22 스크린샷 패턴 + 일반 AI 티 표현)
const FORBIDDEN_PHRASES = [
  "여러분",
  "감사드립니다",
  "함께 해주셔서",
  "응원해주세요",
  "이번 글에서는",
  "이번 글에서",
  "이야기해보려",
  "성장 중입니다",
  "도약합니다",
  "함께 성장",
  "감동적이지 않나요",
  "뭉클",
  // 5/22 스크린샷 정형 양식 패턴
  "제가 말하고 싶은 건",
  "먼저 볼 건 딱",
  "괜히 길게 보기",
  "해당될까 싶으면",
  "체크해두면 돼요",
  "나중에 다시 찾으려면",
  "은근 귀찮아요",
  "이거 그냥 넘기면 안",
  "마감부터 봐야 해요",
];

// 2. 부사 강조
const FORBIDDEN_ADVERBS = ["정말", "엄청", "대단히", "굉장히"];

// 3. HTML entity 미디코드
const HTML_ENTITY_REGEX = /&(?:amp|quot|lt|gt|apos|nbsp|#\d+);/g;

// 4. 정형 양식 — 신청 마감일 + 대상·자격 + 제출 서류 3개 동시 등장
const FORMULAIC_SECTIONS = [
  /신청 ?마감일/,
  /대상[\s·\/]자격/,
  /제출 ?서류/,
];

export interface ValidateOptions {
  /** caption source 식별 (에러 메시지에 표기 — instagram·threads·twitter 등) */
  source?: string;
  /** 위반 발견해도 throw 안 함 — log 만 (점진 마이그레이션·진단용). 기본 false (엄격) */
  warnOnly?: boolean;
  /** 제목+링크 수준의 얇은 게시물을 차단. Threads 같은 공개 SNS 발행 경로에서 사용. */
  requireSubstance?: boolean;
}

export interface ValidateResult {
  ok: boolean;
  violations: string[];
}

/**
 * 캡션 검증 — 위반 발견 시 Error throw (warnOnly=false 기본).
 * 발행 직전 호출 → 자동 cron 차단.
 */
export function validateCaption(
  caption: string,
  opts: ValidateOptions = {},
): ValidateResult {
  if (typeof caption !== "string" || caption.length === 0) {
    const msg = "[validate-caption] caption 이 비어있거나 string 아님";
    if (opts.warnOnly) {
      console.warn(msg);
      return { ok: false, violations: ["empty caption"] };
    }
    throw new Error(msg);
  }

  const violations: string[] = [];

  for (const phrase of FORBIDDEN_PHRASES) {
    if (caption.includes(phrase)) {
      violations.push(`금지 phrase "${phrase}" 등장`);
    }
  }

  for (const adv of FORBIDDEN_ADVERBS) {
    const re = new RegExp(`(^|[^가-힣])${adv}([^가-힣]|$)`, "g");
    if (re.test(caption)) {
      violations.push(`부사 강조 "${adv}" 등장`);
    }
  }

  const htmlMatches = caption.match(HTML_ENTITY_REGEX);
  if (htmlMatches && htmlMatches.length > 0) {
    violations.push(
      `HTML entity 미디코드: ${[...new Set(htmlMatches)].join(", ")}`,
    );
  }

  const formulaicHits = FORMULAIC_SECTIONS.filter((re) => re.test(caption));
  if (formulaicHits.length >= 3) {
    violations.push(
      "정형 양식 (신청마감일+대상자격+제출서류) 동시 등장 — AI 티 강함",
    );
  }

  const hashtags = caption.match(/#[가-힣A-Za-z0-9_]+/g) ?? [];
  if (hashtags.length > 15) {
    violations.push(`해시태그 ${hashtags.length}개 (12개 초과 spam)`);
  }

  if (opts.requireSubstance) {
    const withoutUrls = caption.replace(/https?:\/\/\S+/g, "").trim();
    const lines = withoutUrls
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (withoutUrls.length < 120) violations.push("본문 정보량 부족 (URL 제외 120자 미만)");
    if (lines.length < 3) violations.push("문단 수 부족 (URL 제외 3줄 미만)");
    if (/^[\s\S]+\n\nhttps?:\/\/\S+$/.test(caption.trim())) {
      violations.push("제목+링크 단독 게시");
    }
  }

  if (violations.length === 0) {
    return { ok: true, violations: [] };
  }

  const msg = [
    `[validate-caption] ❌ 검증 fail — source: ${opts.source ?? "(미지정)"}`,
    "",
    "위반:",
    ...violations.map((v) => `  - ${v}`),
    "",
    "참고: keepio_agent CLAUDE.md '캡션 작성 룰' (5/22 강화)",
    "      scripts/validate-caption.cjs (동일 룰)",
  ].join("\n");

  if (opts.warnOnly) {
    console.warn(msg);
    return { ok: false, violations };
  }
  throw new Error(msg);
}

export { FORBIDDEN_PHRASES, FORBIDDEN_ADVERBS };
