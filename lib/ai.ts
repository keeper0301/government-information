// ============================================================
// AI 콘텐츠 생성 — Google Gemini API
// ============================================================
// 정책 데이터 → AdSense 승인용 블로그 글 자동 생성.
// SDK: @google/genai (새 SDK. @google/generative-ai 는 deprecated)
//
// 모델: gemini-2.5-flash (무료 티어, 분당 15회·일 1500회 — 충분)
//   → 매일 1글 발행에 적합. 비용 0원.
//
// 품질 가드 (2026-04-24 신규):
//   이전 Gemini 파이프라인(enrich-llm) 이 description 원문을 필드에 복붙하는
//   사고로 영구 폐기됐음 (커밋 76ff8ab). 복구 시 동일 사고 재발을 막기 위해
//   detectDescriptionCopy·detectMetaCopy 가드를 블로그 본문·meta 에 적용.
//   본문에 원문 description 이 50자 이상 연속 등장하면 "복붙" 으로 간주하고
//   거절 → blog-publish.ts 에서 fallback 또는 cron 재시도.
// ============================================================

import { GoogleGenAI } from "@google/genai";

// 빌드 시점에는 API 키 없어도 통과하도록 lazy init (lib/email.ts 동일 패턴)
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (_ai) return _ai;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

// ============================================================
// 블로그 글 자동 생성 — 정책 데이터 → AdSense 승인용 글
// ============================================================
// AdSense 가이드 충실:
//   - E-E-A-T (출처·전문성)
//   - 1,500~2,500자 한글
//   - 구조화 (H2/H3, 표, 목록)
//   - 사용자 가치 (신청 가이드)
//   - 오리지널 (정부 데이터 가공·해석)
// ============================================================

export type ProgramContext = {
  title: string;            // 정책명
  type: "welfare" | "loan"; // 분류
  category?: string | null;
  target?: string | null;
  description?: string | null;
  eligibility?: string | null;
  benefits?: string | null;     // 혜택 (welfare)
  loan_amount?: string | null;  // 대출 한도 (loan)
  interest_rate?: string | null;
  repayment_period?: string | null;
  apply_method?: string | null;
  apply_url?: string | null;
  apply_start?: string | null;
  apply_end?: string | null;
  source?: string | null;       // 데이터 출처 (예: 복지로)
  region?: string | null;
};

export type GeneratedPost = {
  title: string;             // 글 제목 (검색 친화적)
  meta_description: string;  // 150~160자
  content: string;           // 본문 HTML (1500~2500자)
  category: string;          // 청년/소상공인/주거/육아·가족/노년/학생·교육/큐레이션
  tags: string[];            // 3~6개 태그
  faqs: { question: string; answer: string }[]; // 3~5개 FAQ
};

// 시스템 지침 — 모든 글에 동일 적용
const SYSTEM_INSTRUCTION = `당신은 정부 복지·대출 정책을 일반 시민에게 쉽게 설명하는 한국 콘텐츠 작가입니다.

## 글의 목적
- Google AdSense 승인 가능한 양질의 정보성 가이드
- 사용자가 실제 정책을 신청하는 데 도움이 되는 실용적 내용
- 데이터 출처: 공공데이터포털 (data.go.kr) 의 공식 정책 데이터

## 글 작성 원칙 (AdSense E-E-A-T 준수)
1. **오리지널·가공**: 원본 데이터 그대로 복사 금지. 재구성·해석·정리.
   ⚠️ 특히 [정책 데이터] 의 "설명" 필드를 본문에 그대로 인용하지 마세요.
       반드시 자기 표현으로 풀어쓰기. 동일 문장 50자 이상 연속 복붙 시 자동 거절.
2. **사용자 가치**: 누구·얼마·언제·어떻게 = 4가지 질문에 답하는 구조.
3. **분량 (절대 준수)**: 본문 순수 텍스트 **2,000자 ± 300자** (즉 1,700~2,300자).
   - HTML 태그 제외하고 순수 한글 글자수 기준
   - **2,500자 절대 초과 금지** — 초과 시 발행 실패 처리됨
   - 짧은 게 긴 것보다 좋음. 핵심만 간결하게.
4. **구조**: H2 5~6개 섹션 + 각 섹션 명확한 단락 (문단당 3~5줄).
5. **신뢰성**: 단정적 의료·법률 조언 X. "공식 페이지에서 확인 권장" 명시.
6. **광고 친화**: 욕설·도박·성인·폭력·증오 표현 절대 금지.
7. **표·목록 활용**: 자격 조건·금액 등은 표나 목록으로 가독성↑.
8. **자연스러운 한국어**: AI 티 안 나게. 친근하면서도 전문적.

## 출력 형식 — JSON 만 (마크다운 코드블록 X)
{
  "title": "검색 친화 제목 (45~60자, 연도 포함)",
  "meta_description": "150~160자, 키워드 자연 포함, 사용자 의도 충족",
  "content": "본문 HTML — <h2>·<h3>·<p>·<ul>·<ol>·<table>·<strong>·<a> 사용. 1500~2500자 한글.",
  "category": "청년 | 소상공인 | 주거 | 육아·가족 | 노년 | 학생·교육 | 큐레이션 중 하나",
  "tags": ["태그1", "태그2", "태그3"],
  "faqs": [{"question": "...?", "answer": "..."}, ...]
}

## 본문 HTML 구조 권장
<h2>1. 한눈에 보기</h2>
<table><tr><th>지원 대상</th><td>...</td></tr>...</table>

<h2>2. 누가 받을 수 있나?</h2>
<p>... <ul><li>...</li></ul>

<h2>3. 얼마나·언제 받나?</h2>
<p>...

<h2>4. 어떻게 신청하나?</h2>
<ol><li>...</li></ol>

<h2>5. 자주 묻는 질문 미리보기</h2> (FAQ는 별도 faqs 필드에 5개)

<h2>6. 함께 보면 좋은 정보</h2>
`;

export async function generateBlogPost(
  ctx: ProgramContext,
): Promise<GeneratedPost> {
  const ai = getAI();

  // 정책 데이터를 프롬프트에 인라인
  const programInfo = JSON.stringify(
    {
      정책명: ctx.title,
      분류: ctx.type === "welfare" ? "복지" : "대출·지원금",
      카테고리: ctx.category,
      지원_대상: ctx.target,
      설명: ctx.description,
      자격_조건: ctx.eligibility,
      혜택: ctx.benefits,
      대출_한도: ctx.loan_amount,
      금리: ctx.interest_rate,
      상환_기간: ctx.repayment_period,
      신청_방법: ctx.apply_method,
      공식_링크: ctx.apply_url,
      신청_시작: ctx.apply_start,
      신청_마감: ctx.apply_end,
      출처: ctx.source,
      지역: ctx.region,
    },
    null,
    2,
  );

  const userPrompt = `다음 정책에 대한 AdSense 승인용 블로그 글을 작성해줘. JSON 형식으로만 출력.

[정책 데이터]
${programInfo}

[추가 지시]
- 제목에 올해 연도(${new Date().getFullYear()}년) 자연스럽게 포함
- 공식 신청 페이지 링크 규칙 (엄격):
  * 위 [정책 데이터] 의 "공식_링크" 필드에 값이 있으면 그 URL 을 **정확히 그대로** 복사해서 <a href="공식_링크값" target="_blank" rel="noopener">공식 신청 페이지</a> 형태로 본문 마지막에 포함
  * "공식_링크" 필드가 null·빈 값이면 **링크를 절대 만들지 말 것**. URL 추측·생성 금지. 대신 "자세한 내용은 담당 부처 공식 홈페이지에서 확인하세요" 문장으로 대체
  * 본문 어느 곳에서도 [정책 데이터] 에 없는 URL 을 <a href> 로 쓰지 말 것 (도메인 텍스트 언급은 가능, 링크화는 금지)
- 카테고리는 정책 성격에 맞게 (청년 정책이면 "청년", 자영업 대출이면 "소상공인" 등)
- FAQ 5개 작성 (사용자가 실제 검색하는 질문)
- meta_description 은 정확히 150~160자
- content 는 본문 HTML, 순수 텍스트 1,700~2,300자 (2,500자 초과 절대 금지)`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      // JSON 응답 강제. schema 는 텍스트 지시로도 충분
      temperature: 0.7,
      // 본문 2,300자 + faqs 5개 + meta + tags ≈ 4,200~5,200 토큰. 안전 마진으로 7168.
      // 길이 제어는 instruction + MAX_CONTENT_LENGTH 검증 두 단계로 처리 (여기는 절대 상한)
      maxOutputTokens: 7168,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini 응답이 비어있습니다.");
  }

  let parsed: GeneratedPost;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "파싱 실패";
    throw new Error(`Gemini 응답 JSON 파싱 실패: ${msg}\n원본 (앞 500자): ${raw.slice(0, 500)}`);
  }

  // 최소 필드 검증
  if (!parsed.title || !parsed.content || !parsed.category) {
    throw new Error(`필수 필드 누락: ${JSON.stringify({ hasTitle: !!parsed.title, hasContent: !!parsed.content, hasCategory: !!parsed.category })}`);
  }

  // tags·faqs 가 비어있을 수 있으니 기본값
  parsed.tags = parsed.tags || [];
  parsed.faqs = parsed.faqs || [];

  return parsed;
}

// ============================================================
// 품질 가드 — 원문 description 복붙 감지 (2026-04-24 신규)
// ============================================================
// 이전 Gemini 파이프라인(enrich-llm) 이 description 을 eligibility 에
// 100% 복붙하는 사고로 영구 폐기됨 (76ff8ab). 블로그 복구 시 동일 사고
// 재발 방지용 가드. 비-개발자 입장에서 "AI 가 복붙한 글" 은 AdSense 품질
// 기준에 치명적이기 때문에 사전 차단이 필요.
// ============================================================

// 한글 본문의 "정규화" — 공백·HTML 태그·구두점 제거 후 비교에 사용.
// 복붙 감지는 띄어쓰기나 태그 차이에 속지 않아야 하므로 먼저 단순화.
function normalizeForCompare(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")          // HTML 태그 제거
    .replace(/&[a-z#0-9]+;/gi, " ")   // HTML 엔티티 제거
    .replace(/[\s ]+/g, "")      // 모든 공백 (일반+nbsp) 제거
    .replace(/[.,!?·…:;"'()\[\]{}]/g, "") // 일반 구두점 제거
    .toLowerCase();
}

// 두 문자열 간 "가장 긴 연속 일치" 길이 (Longest Common Substring).
// O(n*m) 공간이지만 description 은 보통 200~1500자라 실용상 문제 없음.
// 50자 이상 연속 일치하면 "복붙" 으로 간주 → 거절.
function longestCommonSubstringLength(a: string, b: string): number {
  if (!a || !b) return 0;
  const n = a.length;
  const m = b.length;
  // 2행만 유지하는 공간 최적화 (ring buffer).
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      } else {
        curr[j] = 0;
      }
    }
    // swap
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return best;
}

// 본문이 description 을 "복붙" 했는지 감지.
// 임계값 50자 — 한글 기준 한 문장 정도. 문장 한 줄 정도 같으면 거절.
const COPY_THRESHOLD_CONTENT = 50;

export type QualityIssue = {
  code: "content_copy" | "meta_copy";
  lcsLength: number;
  threshold: number;
  snippet: string;  // 실제로 일치한 연속 구간 (디버깅·로그용)
};

export function detectDescriptionCopy(
  content: string,
  description: string | null | undefined,
): QualityIssue | null {
  if (!description) return null;
  const normContent = normalizeForCompare(content);
  const normDesc = normalizeForCompare(description);
  // description 자체가 50자 미만이면 검사 무의미 (공식 제목만 짧게 있는 경우 등)
  if (normDesc.length < COPY_THRESHOLD_CONTENT) return null;

  const lcs = longestCommonSubstringLength(normContent, normDesc);
  if (lcs >= COPY_THRESHOLD_CONTENT) {
    // 어느 구간이 겹쳤는지 snippet 뽑아 리턴 (로그 가시성)
    const snippet = findLongestCommonSnippet(normContent, normDesc, lcs);
    return { code: "content_copy", lcsLength: lcs, threshold: COPY_THRESHOLD_CONTENT, snippet };
  }
  return null;
}

// meta_description 은 본문보다 짧아 (150~160자) 임계값을 낮게 잡음.
// 30자 연속 일치하면 description 의 1~2 문장 복사로 간주.
const COPY_THRESHOLD_META = 30;

export function detectMetaCopy(
  meta: string,
  description: string | null | undefined,
): QualityIssue | null {
  if (!description) return null;
  const normMeta = normalizeForCompare(meta);
  const normDesc = normalizeForCompare(description);
  if (normMeta.length < COPY_THRESHOLD_META) return null;

  const lcs = longestCommonSubstringLength(normMeta, normDesc);
  if (lcs >= COPY_THRESHOLD_META) {
    const snippet = findLongestCommonSnippet(normMeta, normDesc, lcs);
    return { code: "meta_copy", lcsLength: lcs, threshold: COPY_THRESHOLD_META, snippet };
  }
  return null;
}

// 실제 겹친 구간 문자열을 한 번 더 스캔해 추출 (디버깅·알림 본문용).
function findLongestCommonSnippet(a: string, b: string, targetLen: number): string {
  if (targetLen <= 0) return "";
  for (let i = 0; i + targetLen <= a.length; i++) {
    const chunk = a.slice(i, i + targetLen);
    if (b.includes(chunk)) return chunk;
  }
  return "";
}
