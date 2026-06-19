// ============================================================
// 외부 발행 품질 게이트
// ============================================================
// 네이버·인스타 같은 외부 채널은 한번 올라가면 수정/삭제 비용이 크다.
// 따라서 blog-quality-check cron 이 통과시킨 글만 자동 발행 대상으로 삼고,
// 채널별 최소 정보량·템플릿 냄새·검색 의도 조건을 한 번 더 fail-closed로 본다.
// ============================================================

export type BlogQualityGateInput = {
  admin_review_required: boolean | null;
  title?: string | null;
  content?: string | null;
  meta_description?: string | null;
  category?: string | null;
};

export type ExternalPublishQualityAssessment = {
  approved: boolean;
  reasons: string[];
  metrics: {
    titleLength: number;
    plainTextLength: number;
    metaLength: number;
    informationSignalCount: number;
    hasOfficialActionSignal: boolean;
    hasTemplateSmell: boolean;
  };
};

const MIN_TITLE_LENGTH = 18;
const MAX_TITLE_LENGTH = 90;
// 외부 채널은 한번 올라가면 수정 비용이 크다. 생성 프롬프트의 하한(95자)과
// 게이트 하한을 맞춰, 너무 짧은 검색 snippet 이 네이버로 빠져나가지 않게 한다.
const MIN_META_LENGTH = 95;
const MIN_CONTENT_LENGTH = 700;
const MIN_INFORMATION_SIGNALS = 4;

const INFORMATION_SIGNAL_RE = [
  /대상|자격|조건|연령|나이|지역|거주|소득|재산|사업자/,
  /지원\s*(금액|내용)|혜택|최대|월\s*\d|분기|만원|원\b/,
  /신청|접수|온라인|방문|홈페이지|누리집|공식|바로가기/,
  /기간|마감|공고|예산\s*소진|선착순|\d{4}[.\-년]/,
  /서류|제출|준비물|증빙|주민등록|소득\s*증명|사업자등록/,
  /문의|전화|센터|담당|기관|부처|지자체/,
];

const TEMPLATE_SMELL_RE = [
  /여러분|감사드립니다|함께 해주셔서|응원해주세요/,
  /이번\s*글에서는|오늘은\s*[^\n]{0,30}에\s*대해|이야기해보려\s*합니다/,
  /제가\s*말하고\s*싶은\s*건|먼저\s*볼\s*건\s*딱|괜히\s*길게\s*보기\s*전에/,
  /해당될까\s*싶으면\s*체크해두면\s*돼요|나중에\s*다시\s*찾으려면\s*은근\s*귀찮아요/,
  /이거\s*그냥\s*넘기면\s*안\s*돼요|마감부터\s*봐야\s*해요/,
  /정말|엄청|대단히|굉장히/,
  /찾는 분들이 많아서\s*핵심만/i,
  /핵심만\s*보기\s*좋게\s*정리/i,
  /바로가기\s*[👇↓]+/i,
  /문의 방법\s*\n\s*상담 가능 시간\s*\n\s*확인할 내용\s*\n\s*특징/i,
  /정리하면\?\s*\n\s*필요한 정보를 찾는 분들은 위 순서대로/i,
  /아래 댓글로 .*궁금한 정책/i,
  /사장님이 궁금한 정책/i,
  /자동으로 정리해 드려요/i,
  /지역\s*:\s*반드시/i,
  /확인하세요하고\s*신청하세요/i,
  /신청하세요하고/i,
  /\{\{[^}]+\}\}/,
  /TODO|TBD|작성 필요/i,
];

export function assessExternalPublishQuality(
  post: BlogQualityGateInput,
): ExternalPublishQualityAssessment {
  const title = normalizeWhitespace(post.title ?? "");
  const content = htmlToPlainText(post.content ?? "");
  const meta = normalizeWhitespace(post.meta_description ?? "");
  const combined = `${title}\n${meta}\n${content}`;
  const informationSignalCount = INFORMATION_SIGNAL_RE.filter((re) => re.test(combined)).length;
  const hasOfficialActionSignal = /공식|신청|접수|홈페이지|누리집|문의|담당|기관|센터/.test(combined);
  const hasTemplateSmell = TEMPLATE_SMELL_RE.some((re) => re.test(combined));

  const reasons: string[] = [];
  if (post.admin_review_required !== false) reasons.push("llm_quality_review_not_approved");
  if (title.length < MIN_TITLE_LENGTH) reasons.push("title_too_short");
  if (title.length > MAX_TITLE_LENGTH) reasons.push("title_too_long");
  if (meta.length < MIN_META_LENGTH) reasons.push("meta_description_too_short");
  if (content.length < MIN_CONTENT_LENGTH) reasons.push("content_too_short_for_external_publish");
  if (informationSignalCount < MIN_INFORMATION_SIGNALS) reasons.push("insufficient_policy_information_signals");
  if (!hasOfficialActionSignal) reasons.push("missing_official_action_signal");
  if (hasTemplateSmell) reasons.push("template_smell_detected");

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      titleLength: title.length,
      plainTextLength: content.length,
      metaLength: meta.length,
      informationSignalCount,
      hasOfficialActionSignal,
      hasTemplateSmell,
    },
  };
}

export function isExternalPublishQualityApproved(
  post: BlogQualityGateInput,
): boolean {
  return assessExternalPublishQuality(post).approved;
}

function htmlToPlainText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'"),
  );
}

function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
