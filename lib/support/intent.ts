// ============================================================
// 사용자 문의 intent 분류 (Phase 4 CS 1차 응대)
// ============================================================
// 사용자 메시지 → intent + confidence + reason. Claude Haiku 1회 호출.
//
// 자동 응답 가능 intent (정해진 응답 메시지 매핑):
//   - refund_policy_question, account_recovery, account_delete,
//     pricing_question, policy_question (정책 검색은 RAG 별도 spec)
//
// 사장님 큐로 가는 intent:
//   - refund_request (실제 환불 요청 — 결제 정보 검토 필요)
//   - bug_report (Sentry 매칭은 Phase 4-B)
//   - feature_request, other
//
// 분류 신뢰도 < 0.7 → 자동 응답 보류, 사장님 큐 직행 (false positive 방지).
// ============================================================

export const SUPPORT_INTENTS = [
  "refund_request",          // 실제 환불 요청
  "refund_policy_question",  // 환불 정책 문의 (자동 응답)
  "account_recovery",        // 계정 복구 (이메일 인증 가이드 자동)
  "account_delete",          // 탈퇴 안내 자동
  "bug_report",              // 버그 (사장님 큐)
  "feature_request",         // 기능 요청 (weekly 검수)
  "policy_question",         // 정책 검색 (RAG 별도)
  "pricing_question",        // 요금제 안내 자동
  "other",                   // 기타 (사장님 큐)
] as const;

export type SupportIntent = (typeof SUPPORT_INTENTS)[number];

// 자동 응답 가능 intent — 정해진 답변 매핑.
// reply 본문은 한국어 (사장님 비개발자 사용자 가독성). 길이 짧게.
export const AUTO_REPLIES: Partial<Record<SupportIntent, string>> = {
  refund_policy_question: `[환불 정책 안내]
- 정기 결제 7일 이내 환불 가능 (단, 사용 이력 없을 때)
- Pro 플랜 월간 결제: 결제 후 7일 이내 100% 환불, 이후 일할 계산 환불
- 처리 시간: 영업일 기준 3~5일 (토스페이먼츠 → 카드사)
- 자세한 절차나 본인 계정 환불 요청은 별도 답변드릴게요. 24h 이내 회신.`,

  account_recovery: `[계정 복구 안내]
1. 로그인 페이지 → "비밀번호 재설정" 클릭
2. 가입한 이메일 입력 → 재설정 링크 발송 (스팸함 확인 권장)
3. 링크 클릭 → 새 비밀번호 설정
이메일이 오지 않거나 위 절차가 실패하면 회신 부탁드려요. 24h 이내 답변.`,

  account_delete: `[탈퇴 안내]
- 마이페이지 하단 → "회원 탈퇴" 클릭 → 사유 선택 + 확인
- 탈퇴 후 30일 유예 — 같은 이메일로 다시 로그인하면 복구 가능
- 30일 후 자동 영구 삭제 (모든 데이터·구독 정보 포함)
탈퇴 진행 중 문제가 생기면 회신 부탁드려요.`,

  pricing_question: `[요금제 안내]
- Free: 정책 검색·블로그 무제한
- Basic 월 ₩4,900: 사장님 자격 자동 판정 + 마감 임박 카톡 알림
- Pro 월 ₩9,900: 베이직 기능 전부 + AI 정책 상담 무제한
자세한 비교는 /pricing 페이지에서 확인하실 수 있어요.`,
};

// 자동 응답 가능한지 — confidence 0.7 이상 + AUTO_REPLIES 매핑 존재
export function canAutoReply(
  intent: SupportIntent,
  confidence: number,
): boolean {
  if (confidence < 0.7) return false;
  return AUTO_REPLIES[intent] !== undefined;
}

export interface ClassificationResult {
  intent: SupportIntent;
  confidence: number;
  reason: string;
}

// Claude Haiku 호출 — Anthropic Messages API.
// ANTHROPIC_API_KEY 미설정 시 default { intent: "other", confidence: 0 } 반환
// (graceful degradation — 사장님 큐 직행).
export async function classifySupportIntent(
  message: string,
  subject?: string,
): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { intent: "other", confidence: 0, reason: "ANTHROPIC_API_KEY missing" };
  }

  const userInput = [subject ? `제목: ${subject}` : "", `본문: ${message}`]
    .filter(Boolean)
    .join("\n");

  const prompt = `당신은 정책 정보 사이트 keepioo.com 의 CS 응대 분류 도우미입니다.
사용자 문의를 다음 9가지 중 하나로 분류하세요:

1. refund_request — "결제 환불해주세요", "취소·환불 요청" 등 실제 환불 처리 요구
2. refund_policy_question — "환불 정책이 어떻게 되나요" 같은 정책 문의
3. account_recovery — "비밀번호 잊었어요", "로그인 안 돼요"
4. account_delete — "탈퇴하고 싶어요"
5. bug_report — "에러", "안 돌아가요", "이상해요" 등 기술 문제
6. feature_request — "X 기능 추가해주세요"
7. policy_question — "어떤 정책이 있나요", "청년 지원 알려주세요" 같은 정책 검색
8. pricing_question — "요금제", "Pro 가격"
9. other — 위 8가지에 안 들어가는 모든 문의

JSON 만 반환하세요:
{ "intent": "...", "confidence": 0.85, "reason": "한 줄 요약" }

confidence 는 0~1, 애매하면 0.5 이하로.`;

  const body = {
    // 다른 lib (lib/news/classify.ts, lib/press-ingest/classify.ts) 와 동일 dated id
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      { role: "user", content: `${prompt}\n\n사용자 문의:\n${userInput}` },
    ],
  };

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      intent: "other",
      confidence: 0,
      reason: `API call failed: ${(e as Error).message.slice(0, 80)}`,
    };
  }

  if (!res.ok) {
    return {
      intent: "other",
      confidence: 0,
      reason: `HTTP ${res.status}`,
    };
  }

  const data = (await res.json().catch(() => null)) as {
    content?: Array<{ type: string; text: string }>;
  } | null;

  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  return parseClassificationResponse(text);
}

// LLM 응답 → ClassificationResult. JSON 파싱 실패·잘못된 intent 는 default.
// pure function — 단위 테스트 용이.
export function parseClassificationResponse(text: string): ClassificationResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { intent: "other", confidence: 0, reason: "no_json_in_response" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      intent?: string;
      confidence?: number;
      reason?: string;
    };
    const intent = (SUPPORT_INTENTS as readonly string[]).includes(
      parsed.intent ?? "",
    )
      ? (parsed.intent as SupportIntent)
      : "other";
    const confidence =
      typeof parsed.confidence === "number" &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
        ? parsed.confidence
        : 0;
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "";
    return { intent, confidence, reason };
  } catch {
    return { intent: "other", confidence: 0, reason: "json_parse_failed" };
  }
}
