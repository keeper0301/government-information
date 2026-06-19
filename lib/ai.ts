// ============================================================
// AI 콘텐츠 생성 — Google Gemini API
// ============================================================
// 정책 데이터 → AdSense 승인용 블로그 글 자동 생성.
// SDK: @google/genai (새 SDK. @google/generative-ai 는 deprecated)
//
// 모델: gemini-2.5-flash (Tier 2 유료, 선불 prepay 충전식 — 2026-06-05 확인).
//   → 매일 1글 발행. ⚠️ prod GEMINI_API_KEY = keepioo project 키. 결제가 "선불
//      충전식"이라 충전 잔액이 0 이 되면 한도(quota/spending cap/rate limit)와
//      무관하게 429 RESOURCE_EXHAUSTED ("Your prepayment credits are depleted")로
//      blog 발행이 멈춘다 (2026-06-05 발행 0건 사고 — 진단 라우트 raw fetch 로 원본 확인).
//      → AI Studio 선불 자동충전(auto top-up) 설정으로 재발 방지(결제라 사장님 직접).
//   ⚠️ 과거 추정(BlogFury/strong-augury project 의 Nano Banana 2 quota 공유 압박)은
//      오진이었음 — 그날 quota·spending cap·rate limit 모두 여유였고(RPD 0.03% 등),
//      실제 원인은 선불 잔액 소진이었다. [[blog-publish-spending-cap-incident-2026-05-17]] 메모리 참고.
//
// 품질 가드 (2026-04-24 신규):
//   이전 Gemini 파이프라인(enrich-llm) 이 description 원문을 필드에 복붙하는
//   사고로 영구 폐기됐음 (커밋 76ff8ab). 복구 시 동일 사고 재발을 막기 위해
//   detectDescriptionCopy·detectMetaCopy 가드를 블로그 본문·meta 에 적용.
//   본문에 원문 description 이 50자 이상 연속 등장하면 "복붙" 으로 간주하고
//   거절 → blog-publish.ts 에서 fallback 또는 cron 재시도.
// ============================================================

import { GoogleGenAI } from "@google/genai";
import { callLLM } from "@/lib/llm/text";

const GEMINI_REQUEST_TIMEOUT_MS = 45_000;

// 빌드 시점에는 API 키 없어도 통과하도록 lazy init (lib/email.ts 동일 패턴)
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (_ai) return _ai;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  _ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
      retryOptions: { attempts: 1 },
    },
  });
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
  /** 최근 품질 검수에서 반복 지적된 개선 포인트 */
  qualityLearningHints?: string[];
  /** 최근 내부 성과 데이터에서 나온 카테고리·태그·제목 트렌드 */
  trendLearningHints?: string[];
};

export type GeneratedPost = {
  title: string;             // 글 제목 (검색 친화적)
  meta_description: string;  // 150~160자
  content: string;           // 본문 HTML (순수 텍스트 2,800~3,800자)
  category: string;          // 청년/소상공인/주거/육아·가족/노년/학생·교육/큐레이션
  tags: string[];            // 3~6개 태그
  faqs: { question: string; answer: string }[]; // 3~5개 FAQ
  // 어느 LLM 으로 생성됐는지 (2026-06-05) — "openai" 면 Gemini 실패로 비상 백업이
  // 발동한 것. caller(route)가 audit 기록 + 텔레그램 조기경보(gpt-4o 비용 가시화)에 사용.
  _provider?: "gemini" | "openai";
  // 비용 추적용 (5/17 추가) — Gemini API 의 usageMetadata 그대로 보존.
  // caller (lib/blog-publish.ts) 가 audit details 에 저장 → autonomous hub 차트.
  _usage?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
};

// ─── 페르소나 rotation (2026-05-10 AdSense "thin/scaled content" 거절 대응) ───
// 모든 글이 동일 시스템 prompt 로 생성되면 검수자에게 "AI 자동 대량 생산" 으로 보임.
// 발행마다 4 페르소나 중 무작위 선택 — 어조·강조점에 자연스러운 다양성 확보.
// 페르소나는 "글의 목적·구조·분량" 같은 본문 룰을 바꾸지 않음 (오직 어조만).

type BlogPersona = {
  id: string;       // log·debug 용
  intro: string;    // SYSTEM_INSTRUCTION 첫 줄 (작가 정체성)
  emphasis: string; // 페르소나 강조점 한 줄
};

const BLOG_PERSONAS: BlogPersona[] = [
  {
    id: "guide",
    intro: "당신은 정부 복지·대출 정책을 일반 시민에게 쉽게 풀어 설명하는 한국 콘텐츠 작가입니다.",
    emphasis: "친근하고 명확한 설명에 강점. 어려운 행정 용어는 한 번 더 풀어 적으세요.",
  },
  {
    id: "social_worker",
    intro: "당신은 동주민센터·복지관 현장에서 오래 일해 온 사회복지사 시각으로 정부 정책을 풀어 주는 한국 작가입니다.",
    emphasis: "신청 현장에서 자주 묻는 질문, 놓치기 쉬운 함정, 서류 준비 팁에 강점이 있습니다.",
  },
  {
    id: "fact_checker",
    intro: "당신은 공공 데이터를 꼼꼼히 검증해 정리하는 정책 팩트체커 한국 작가입니다.",
    emphasis: "구체 숫자·기간·자격 조건을 한 번 더 확인해 표로 정리하고, 공식 출처를 명확히 짚어 주세요.",
  },
  {
    id: "experienced_user",
    intro: "당신은 본인과 가족이 여러 정부 지원금을 직접 신청·이용해 본 경험을 바탕으로 글을 풀어 주는 한국 작가입니다.",
    emphasis: "신청서 작성·심사 대기·실제 수령 같은 사용자 흐름 시각으로 서술. 단, 가짜 개인 사례는 절대 만들지 말고 일반화된 표현을 쓰세요.",
  },
];

function pickBlogPersona(): BlogPersona {
  return BLOG_PERSONAS[Math.floor(Math.random() * BLOG_PERSONAS.length)];
}

function buildSystemInstruction(persona: BlogPersona): string {
  return `${persona.intro}\n${persona.emphasis}\n\n${SYSTEM_INSTRUCTION_BODY}`;
}

export function getContentSeasonalFocus(now = new Date()): string {
  const month = now.getMonth() + 1;
  if (month <= 2) {
    return "연초 신규 모집, 예산 확정, 청년·소상공인 지원금 탐색";
  }
  if (month <= 4) {
    return "입학·취업·이사철, 주거비·교육비·청년 취업 지원";
  }
  if (month <= 6) {
    return "상반기 마감 전 신청, 근로장려·육아·운영자금 점검";
  }
  if (month <= 8) {
    return "여름방학·휴가철, 문화·교육·에너지 비용 절감";
  }
  if (month <= 10) {
    return "하반기 채용·창업·주거 안정, 예산 소진 전 신청";
  }
  return "연말 마감, 다음 해 제도 변경, 미신청 지원금 최종 점검";
}

// 시스템 지침 본문 — 모든 페르소나 공통 (글의 목적·구조·분량·AdSense 룰)
// 2026-04-24 P1 개선: SEO(meta 길이·내부링크·H3)·AEO(직답·FAQ)·GEO(정의 문장·질문형 H2·
// 숫자 강조)·AdSense(E-E-A-T) 축을 모두 충족하도록 강화.
// 2026-05-10: 페르소나 rotation 도입으로 첫 줄 "당신은..." 은 동적 주입.
const SYSTEM_INSTRUCTION_BODY = `## 글의 목적
- Google AdSense 승인 가능한 양질의 정보성 가이드
- 검색엔진(SEO), 답변엔진(AEO), AI 검색엔진(ChatGPT·Perplexity·Gemini 등 GEO) 모두에 최적화
- 사용자가 실제 정책을 신청하는 데 도움이 되는 실용적 내용
- 데이터 출처: 공공데이터포털 (data.go.kr) 의 공식 정책 데이터

## 글 작성 원칙 (E-E-A-T + SEO + AEO + GEO 동시 준수)

1. **오리지널·가공**: 원본 데이터 그대로 복사 금지. 재구성·해석·정리.
   ⚠️ 특히 [정책 데이터] 의 "설명" 필드를 본문에 그대로 인용하지 마세요.
       반드시 자기 표현으로 풀어쓰기. 동일 문장 50자 이상 연속 복붙 시 자동 거절.

2. **정의 문장 먼저 (AEO/GEO 필수)**: 본문 첫 문단(한눈에 보기 앞/안 첫 줄) 은 반드시
   **"○○는 ~~을 위한 ~~ 제도입니다"** 형식의 정의 문장으로 시작. AI 검색엔진이
   인용할 수 있는 "이 글이 뭐에 관한 것인지" 한 문장 요약이 됨. 이어서 대상·혜택·신청경로를
   2~3문장 안에 바로 답해 featured snippet/answer box 에 맞춘다.
   예) "청년 주거급여 분리지급은 부모와 떨어져 사는 저소득 청년에게 월세를
        별도 지원하는 제도입니다."

3. **사용자 가치 · 질문형 H2 (AEO/GEO 필수)**: 누구·얼마·언제·어떻게 = 4가지 질문에
   답하는 구조. H2 중 최소 3개는 반드시 **질문형**:
   "누가 받을 수 있나요?" / "얼마 받나요?" / "언제까지 신청하나요?" / "어떻게 신청하나요?"

4. **H2/H3 계층과 글자 크기 전제 (SEO/AEO)**: H2 는 큰 구간 제목, H3 는 H2 안의 세부 조건으로만 사용.
   네이버 발행 formatter 가 H2=24px 굵은 좌측바, H3=19px 작은 좌측바로 다르게 보이게 하므로
   H2/H3 를 섞어 쓰지 말고 정보 계층을 정확히 나눈다.
   - H2 예: "누가 받을 수 있나요?", "얼마 · 언제 받나요?", "어떻게 신청하나요?"
   - H3 예: "지역 조건", "기업 유형 조건", "제출 서류", "신청 단계"
   - H3 는 단독 제목이 아니라 바로 아래에 2~4문장 또는 리스트로 답을 붙인다.

5. **구체 숫자 강조 (AEO/GEO 필수)**: 원본에 나온 금액·연령·소득·기간 같은 **숫자**는
   반드시 <strong> 태그로 감싸기. AI 검색엔진이 데이터 포인트로 추출.
   예) "월 <strong>20만 원</strong> 까지 <strong>최대 12개월</strong> 지원"

6. **분량 (절대 준수 — 가장 중요한 룰)**: 본문 순수 텍스트 **2,800~3,800자** 필수.
   - HTML 태그 제외 순수 한글 글자수 기준.
   - 🚨 **2,000자 미만이면 AdSense 정책상 발행 거부 → 즉시 실패**. 절대 짧게 쓰지 말 것.
   - **4,500자 절대 초과 금지**.
   - 분량은 잡담이 아니라 깊이로 채울 것: 자격·금액·신청 절차를 H3·table·ul·ol 로
     구체화하고, 신청 시 자주 묻는 점·놓치기 쉬운 함정·공식 원문에서 재확인할 항목을 더한다.
   - 5/18 fix: 이전 prompt 의 "짧은 게 긴 것보다 좋음" 지침이 본문 < 1000자 생성 폭주 일으킴 (cron_failure_log 7 카테고리 fail) → 명시 제거.

7. **구조 · 가독성**: H2 5~6개 + 각 H2 밑 H3 0~2개 + 문단당 2~4줄.
   네이버 외부 발행까지 고려해 참고글(cgc0904/224279232682)처럼 단순하고 읽기 쉬운 흐름을 우선합니다.
   - 첫 화면: 짧은 정의/요약 문단 2개 → 가운데 CTA → 본문 상세 섹션
   - H2/H3 문구는 짧고 질문형/조건형으로. 자동 생성 티 나는 "검색 핵심 정보", "요약 답변" 같은 반복 제목 남발 금지
   - 문단은 좌측 정렬 기준으로 자연스럽게. 과한 카드형 CTA·광고 문구보다 정보 문단 우선
   자격 조건·금액·신청 절차는 반드시 다음 시각 요소를 활용해서 가독성↑:
   - **<table>** : "지원 대상", "지원 금액", "신청 기간" 같은 항목·값 정리 (1개 이상)
   - **체크리스트 <ul>** : "신청 자격 한눈에" H2 밑에 ✓ / ✗ 마커로 5~7개 항목.
     예) <li>✓ 만 19~34세 청년</li><li>✓ 중위소득 120% 이하</li><li>✗ 부모 명의 주택 보유 시 제외</li>
     사용자가 본인 해당 여부를 즉시 판단할 수 있게 함.
   - **번호 단계 <ol>** : "어떻게 신청하나요?" H2 는 반드시 <ol> 로 1·2·3 단계 명시.

8. **AEO 답변 블록**: FAQ 와 본문 소제목은 사용자가 그대로 묻는 질문 형태를 우선한다.
   각 H2 첫 문단은 "결론부터 말하면" 식의 짧은 직접 답변 1~2문장으로 시작하고,
   그 뒤 조건·예외·서류·주의사항을 H3/목록/표로 확장한다.

9. **신뢰성**: 단정적 의료·법률 조언 X. "공식 페이지에서 확인 권장" 명시.

10. **광고 친화 (AdSense)**: 욕설·도박·성인·폭력·증오·극단적 정치 표현 절대 금지.

11. **자연스러운 한국어**: AI 티 안 나게. 친근하면서도 전문적.

## 출력 형식 — JSON 만 (마크다운 코드블록 X)
{
  "title": "검색 친화 제목 (30~48자, 연도 포함)",
  "meta_description": "150~160자, 95자 미만 금지, 키워드 자연 포함, 사용자 의도 충족 (155자 권장)",
  "content": "본문 HTML — <h2>·<h3>·<p>·<ul>·<ol>·<table>·<strong>·<a> 사용. 2,800~3,800자 한글.",
  "category": "청년 | 소상공인 | 주거 | 육아·가족 | 노년 | 학생·교육 | 큐레이션 중 하나",
  "tags": ["태그1", "태그2", "태그3"],
  "faqs": [{"question": "...?", "answer": "..."}, ...]
}

## 본문 HTML 구조 권장
<p><strong>정책명</strong>은 ~~을 위한 ~~ 제도입니다. 핵심 대상과 지원 내용을 먼저 2~3문장으로 자연스럽게 설명합니다.</p>
<p>대상·금액·마감·신청 경로를 차례대로 확인하면 됩니다. 과장된 권유보다 실제 확인 순서를 안내합니다.</p>

<h2>지원 내용은 무엇인가요?</h2>
<table><tr><th>지원 대상</th><th>지원 금액</th><th>신청 기간</th><th>신청 방법</th></tr><tr><td>...</td><td><strong>월 N만 원</strong></td><td>...</td><td>온라인/방문</td></tr></table>

<h2>신청 자격 한눈에</h2>
<ul>
<li>✓ <strong>만 19~34세</strong> 청년</li>
<li>✓ <strong>중위소득 120%</strong> 이하 가구</li>
<li>✗ 부모 명의 주택 보유 시 제외</li>
</ul>

<h2>누가 받을 수 있나요?</h2>
<h3>나이 · 지역 조건</h3>
<p>... (구체 숫자 <strong> 강조)</p>
<h3>소득 · 자격 조건</h3>
<ul><li><strong>중위소득 120%</strong> 이하 가구</li>...</ul>

<h2>얼마 · 언제 받나요?</h2>
<p>... <strong>최대 N만 원</strong> 까지 ...</p>

<h2>어떻게 신청하나요?</h2>
<ol>
<li>공식 사이트 접속 후 회원가입</li>
<li>신청서 작성 + 증빙서류 업로드</li>
<li>심사 결과 통보 (영업일 N일 이내)</li>
</ol>

<h2>놓치지 말아야 할 점</h2>
<p>주의사항·함께 알아두면 좋은 정보.</p>

<h2>더 알아보기</h2>
<p>더 자세한 맞춤 정책은 <a href="/recommend">나에게 맞는 정책 찾기</a>에서 조건 몇 개만 입력하면 바로 확인할 수 있어요.</p>
<!-- 공식_링크 있으면 여기에 <a href="공식_링크" target="_blank" rel="noopener">공식 신청 페이지</a> 추가 -->
`;

// ============================================================
// LLM 호출 — Gemini 우선, 실패 시 OpenAI 비상 우회 (2026-06-05)
// ============================================================
// blog 가 단일 LLM 장애로 멈추지 않게 이중화. 평소엔 Gemini(품질·비용 유리),
// Gemini 가 선불 크레딧 소진(429 RESOURCE_EXHAUSTED)·quota·5xx 등으로 죽으면
// OpenAI(gpt-4o)가 같은 prompt 로 글을 대신 생성한다. 품질 가드(본문 길이·복붙)는
// caller(blog-publish)에서 provider 무관하게 동일 적용되므로, 부실한 백업 글은
// 자동 거절·재시도된다. 2026-06-05 prepay 소진으로 blog 24h 멈춘 사고 후 도입.

type RawBlogResult = {
  raw: string | undefined;
  usage?: GeneratedPost["_usage"];
  provider: "gemini" | "openai";
};

// Gemini(gemini-2.5-flash) 호출 → raw JSON 문자열 + usage(비용 추적용).
async function generateViaGemini(
  systemInstruction: string,
  userPrompt: string,
): Promise<RawBlogResult> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      // 0.85: 페르소나 rotation 과 함께 표현 다양성 (정확도는 prompt 룰이 담보).
      temperature: 0.85,
      thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
      // 본문 3,800자 + faqs + meta ≈ 6,500~8,000 토큰. 안전 마진 10240.
      maxOutputTokens: 10240,
    },
  });
  const meta = response.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  return {
    raw: response.text,
    usage: meta
      ? {
          promptTokens: meta.promptTokenCount ?? 0,
          candidatesTokens: meta.candidatesTokenCount ?? 0,
          totalTokens: meta.totalTokenCount ?? 0,
        }
      : undefined,
    provider: "gemini",
  };
}

// OpenAI 비상 우회. callLLM 은 system/user 를 분리하지 않으므로 합쳐 전달.
// 모델은 gpt-4o — gpt-4o-mini 는 본문을 591~859자로 짧게 반환한 전력(5/18 사고)이
// 있어 분량 가드(2,000자)를 못 넘기므로, 백업은 상위 모델로 품질을 확보한다.
const OPENAI_FALLBACK_MODEL = "gpt-4o";
const OPENAI_FALLBACK_MAX_TOKENS = 10000; // 본문 3,800자 + faqs + meta 수용
const OPENAI_FALLBACK_TIMEOUT_MS = 35_000; // Gemini full timeout(45s) 후에도 maxDuration(90s) 안에 후처리까지 여유

async function generateViaOpenAI(
  systemInstruction: string,
  userPrompt: string,
): Promise<RawBlogResult> {
  const raw = await callLLM({
    prompt: `${systemInstruction}\n\n${userPrompt}`,
    jsonMode: true,
    model: OPENAI_FALLBACK_MODEL,
    maxTokens: OPENAI_FALLBACK_MAX_TOKENS,
    timeoutMs: OPENAI_FALLBACK_TIMEOUT_MS,
  });
  // callLLM 은 usage 를 반환하지 않음 → 비용 추적 생략(폴백은 예외 상황이라 허용).
  return { raw, provider: "openai" };
}

// Gemini 우선 → 실패 시 OpenAI 비상 우회.
async function generateRawBlogJson(
  systemInstruction: string,
  userPrompt: string,
): Promise<RawBlogResult> {
  try {
    return await generateViaGemini(systemInstruction, userPrompt);
  } catch (geminiErr) {
    const gmsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    console.warn(`[ai] Gemini 블로그 생성 실패 → OpenAI 비상 우회 시도: ${gmsg}`);
    try {
      const result = await generateViaOpenAI(systemInstruction, userPrompt);
      console.warn("[ai] OpenAI 비상 우회로 블로그 생성 성공");
      return result;
    } catch (openaiErr) {
      const omsg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
      throw new Error(
        `블로그 생성 실패 — Gemini·OpenAI 모두 실패. Gemini: ${gmsg} / OpenAI: ${omsg}`,
      );
    }
  }
}

export async function generateBlogPost(
  ctx: ProgramContext,
): Promise<GeneratedPost> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const seasonalFocus = getContentSeasonalFocus(now);

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
  const learningHints = (ctx.qualityLearningHints ?? [])
    .map((hint) => hint.trim())
    .filter(Boolean)
    .slice(0, 5);
  const learningBlock =
    learningHints.length > 0
      ? `\n[최근 품질 검수 학습]\n${learningHints
          .map((hint, idx) => `${idx + 1}. ${hint}`)
          .join("\n")}\n- 위 지적은 최근 자동 품질 검수에서 나온 반복 개선점입니다. 이번 글에서는 같은 문제가 다시 나오지 않게 작성하세요.\n`
      : "";
  const trendHints = (ctx.trendLearningHints ?? [])
    .map((hint) => hint.trim())
    .filter(Boolean)
    .slice(0, 5);
  const trendBlock =
    trendHints.length > 0
      ? `\n[최근 반응/외부 채널 학습]\n${trendHints
          .map((hint, idx) => `${idx + 1}. ${hint}`)
          .join("\n")}\n- 위 신호는 keepioo 내부 조회수·카테고리·태그와 네이버/인스타 발행 결과 기반입니다. 억지로 끼워 넣지 말고, 이번 정책과 자연스럽게 맞는 키워드·표현만 반영하세요.\n`
      : "";

  const userPrompt = `다음 정책에 대한 정보성 블로그 글을 작성하세요. JSON 형식으로만 출력하세요.

[정책 데이터]
${programInfo}
${learningBlock}
${trendBlock}

[현재 마케팅 컨텍스트]
- 기준 시점: ${currentYear}년 ${currentMonth}월
- 시즌/트렌드 힌트: ${seasonalFocus}
- 이 글의 1차 목적은 keepioo 블로그에 올릴 신뢰성 있는 안내문입니다. SNS식 구어체, 과장 CTA, 클릭 유도 문구를 섞지 마세요.
- 첫 화면에서 대상·금액·마감·신청 액션을 바로 이해할 수 있게 쓰되, 표현은 행정 안내문처럼 차분하게 유지하세요.
- 외부 채널에 재사용될 수 있으므로 공식 신청 경로, 변동 가능성, 제출 서류 확인 포인트를 명확히 쓰세요.

[추가 지시 — SEO · GEO · AdSense 최적화]

## 제목 (title) — SEO + CTR 핵심
- 올해 연도(${currentYear}년) 자연스럽게 포함
- **길이 30~48자** (Google 검색결과 표시 약 50자에서 잘리므로 짧게)
- 검색 의도 키워드(누가·무엇·얼마) 1개 이상 포함
- **첫 5~10자에 가장 강력한 hook** — 구체 숫자(금액·연령·소득) 또는 핵심 대상 명시.
  검색결과에서 사용자 시선이 머무는 첫 인상 결정. 예시:
    좋음: "월 30만원 청년 주거비 — 만 19~34세 신청 자격" (32자, 숫자·대상 즉시 노출)
    좋음: "2026년 다자녀 셋째 출산장려금 1,500만원 한 번에" (35자)
    피할 것: "2026년 ○○시에서 청년에게 주거비를 지원합니다" (정형구·매력 X)
- "~받으세요", "~혜택", "~지원 가이드" 같은 뻔한 정형구 지양 — CTR 깎임
- 호기심 자극보다 정보 선명도를 우선. "마감 임박", "올해까지", "자격 확인"처럼 사실 기반 표현만 사용.
- "놓치면", "무조건", "지금 안 하면"처럼 불안감을 키우는 클릭베이트 표현은 금지.
- 🚨 **절대 금지 (5/22 사장님 명시 신뢰도 fail)**: "여러분", "감사드립니다",
  "이거 그냥 넘기면 안 돼요", "마감부터 봐야 해요", "제가 말하고 싶은 건",
  "정말", "엄청", "굉장히" 등 — SNS 발행 시 validate-caption 차단됨.

## meta_description (SEO + CTR 핵심)
- **목표 150~160자** (절대 95자 미만 금지 — 가드에 걸려 거절됨)
- 생성 순서: content 작성 **완료 후 마지막으로** meta 작성 (글자수 세면서)
- **첫 12자 = snippet 핵심**. Google 모바일 검색결과에서 첫 12자만 굵게 표시되고
  나머지는 "..." 잘림. 첫 12자에 가장 강력한 hook (구체 숫자 + 자격 + 액션) 배치.
  예시 첫 12자: "만 24세 청년 25만원" / "셋째 출산 1,500만원" / "기초수급 의료급여 100%"
- 구성: 첫 문장 = 정책 핵심(누가·무엇·얼마) — 12자 안에 hook 포함 /
  둘째 문장 = 자격·기간 구체 / 셋째 문장 = CTA("1분 자격 진단" 등)
- ⚠️ **평문 절대 엄수**: <strong>, <b>, <em> 등 HTML 태그 일체 금지.
  meta 는 검색 결과·블로그 카드에 text 로만 렌더 — 태그가 "그대로 노출"됨.
  숫자 강조는 content(본문) 에서만 <strong> 으로 감싸고, meta 에는 평문 숫자 그대로.
- 따옴표·이모지 금지. 문장 3개로 155자 채우기가 가장 쉬움
- 🚨 **절대 금지 phrase (5/22 사장님 명시 — 발행 즉시 신뢰도 fail)**:
  호칭 X: "여러분", "감사드립니다", "함께 해주셔서", "응원해주세요"
  광고 카피 X: "이번 글에서는", "오늘은 ~에 대해", "이야기해보려 합니다"
  정형 양식 X: "제가 말하고 싶은 건", "먼저 볼 건 딱", "괜히 길게 보기 전에",
    "해당될까 싶으면 체크해두면 돼요", "나중에 다시 찾으려면 은근 귀찮아요",
    "이거 그냥 넘기면 안 돼요", "마감부터 봐야 해요"
  부사 강조 X: "정말", "엄청", "대단히", "굉장히"
  정형 list 동시 X: "신청 마감일 / 대상·자격 기준 / 제출 서류" 3개 동시 나열 X
  두루뭉수리 X: "성장 중입니다", "도약합니다", "함께 성장"
  HTML entity raw X: "R&amp;D" 그대로 X — "R&D" 평문 디코드
  자동 검증: SNS 발행 직전 validate-caption 통과 못 하면 차단됨.

## 본문 (content) — 필수 요소
1. **첫 문단 정의형 (GEO 필수)**: content 는 반드시 <h2>가 아니라 <p>로 시작하세요.
   첫 문장은 "<strong>정책명</strong>은 ~~을 위한 ~~ 제도입니다" 형식의 정의 문장 1줄이어야 합니다.
   AI 검색엔진이 이 문장을 인용함.

2. **질문형 H2 최소 3개**: "누가 받을 수 있나요?", "얼마 받을 수 있나요?",
   "언제까지 신청하나요?", "어떻게 신청하나요?" 중 3개 이상 사용.

3. **H3 서브섹션**: 복잡한 H2 밑에 H3 1~2개로 세분 (특히 자격 조건·신청 절차).

4. **구체 숫자 <strong> 강조**: [정책 데이터] 에 나온 금액·연령·소득·기간 등
   모든 **숫자 표현**은 <strong>월 30만 원</strong>, <strong>만 19~34세</strong>
   같이 감싸서 AI 가 추출 가능하게. 숫자 자체가 없으면 강제하지 말 것.

5. **내부 링크 (SEO)**: 본문 마지막 "더 알아보기" 섹션에 반드시
   <a href="/recommend">나에게 맞는 정책 찾기</a> 1개 포함.

6. **공식 신청 페이지 링크 규칙 (엄격)**:
   - [정책 데이터] 의 "공식_링크" 값이 있으면 그 URL 을 **정확히 그대로** 복사해
     <a href="공식_링크값" target="_blank" rel="noopener">공식 신청 페이지</a> 형태로 본문 마지막에 포함
   - "공식_링크" 가 null·빈 값이면 **URL 추측·생성 절대 금지**. "담당 부처 공식
     홈페이지에서 확인하세요" 문장으로 대체.
   - 본문 어디에도 [정책 데이터] 에 없는 URL 을 <a href> 로 쓰지 말 것.

7. **분량**: 순수 텍스트(HTML 태그 제외) 2,800~3,800자. 4,500자 초과 절대 금지.

## 카테고리 · 태그 · FAQ
- category 는 정책 성격에 맞게 (청년 정책→"청년", 자영업 대출→"소상공인" 등)
- tags 는 3~6개, 실제 검색어 기반 (정책명 약어·대상·연도·관련 개념)
- FAQ 5개, 사용자가 실제 검색할 법한 질문 (나이·소득·중복 수령·취소·마감 등)
- ⚠️ FAQ 의 question/answer 는 **평문 한글 만** 사용. \`<strong>\` · \`<em>\` · \`<a>\` 등 HTML 태그 절대 금지.
  본문 content 는 HTML 렌더링이지만 FAQ 는 평문 렌더링이라 태그가 글자 그대로 노출됨.
  강조는 « » 또는 따옴표 또는 문장 구조로 표현. 숫자 강조는 그냥 숫자 (예: "월 100만 원").`;

  // 페르소나 무작위 선택 (4종) — "AI 자동 대량 생산" 시그널 분산. AdSense 검수자 sample 시
  // 표현·어조 다양성 확보. 2026-05-10 거절 ("가치 별로 없는 콘텐츠") 대응.
  const persona = pickBlogPersona();
  const systemInstruction = buildSystemInstruction(persona);

  // Gemini 우선 호출 → 실패(선불 크레딧 소진·quota·장애 등) 시 OpenAI 비상 우회.
  // 설정·폴백 로직은 generateRawBlogJson / generateViaGemini / generateViaOpenAI 참고.
  const { raw, usage, provider } = await generateRawBlogJson(systemInstruction, userPrompt);
  if (!raw) {
    throw new Error("LLM 응답이 비어있습니다.");
  }

  let parsed: GeneratedPost;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "파싱 실패";
    throw new Error(`LLM 응답 JSON 파싱 실패: ${msg}\n원본 (앞 500자): ${raw.slice(0, 500)}`);
  }

  // 최소 필드 검증
  if (!parsed.title || !parsed.content || !parsed.category) {
    throw new Error(`필수 필드 누락: ${JSON.stringify({ hasTitle: !!parsed.title, hasContent: !!parsed.content, hasCategory: !!parsed.category })}`);
  }

  // tags·faqs 가 비어있을 수 있으니 기본값
  parsed.tags = parsed.tags || [];
  parsed.faqs = parsed.faqs || [];

  // 어느 LLM 으로 생성됐는지 기록 — caller(route)가 OpenAI 폴백 발동을 감지·알림.
  parsed._provider = provider;
  // 비용 추적 — Gemini usageMetadata 보존(OpenAI 폴백 시엔 usage 없음). caller 가 audit 저장.
  if (usage) {
    parsed._usage = usage;
  }

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
