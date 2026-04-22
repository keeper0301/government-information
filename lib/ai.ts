// ============================================================
// AI 콘텐츠 생성 — Google Gemini API
// ============================================================
// 정책 데이터 → AdSense 승인용 블로그 글 자동 생성.
// 새 SDK: @google/genai (구 @google/generative-ai 는 deprecated)
//
// 모델: gemini-2.5-flash (무료 티어, 분당 15회·일 1500회 — 충분)
//   → 매일 1글 발행에 적합. 비용 0원.
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
2. **사용자 가치**: 누구·얼마·언제·어떻게 = 4가지 질문에 답하는 구조.
3. **분량**: 본문 1,500~2,500자 한글 (짧지도 길지도 않게).
4. **구조**: H2 5~6개 섹션 + 각 섹션 명확한 단락.
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
- 공식 신청 페이지 링크가 있다면 본문 마지막에 <a href="...">공식 신청 페이지</a> 형태로
- 카테고리는 정책 성격에 맞게 (청년 정책이면 "청년", 자영업 대출이면 "소상공인" 등)
- FAQ 5개 작성 (사용자가 실제 검색하는 질문)
- meta_description 은 정확히 150~160자
- content 는 본문 HTML, 1500~2500자 한글`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      // JSON 응답 강제. schema 는 텍스트 지시로도 충분
      temperature: 0.7,
      maxOutputTokens: 8192,
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
