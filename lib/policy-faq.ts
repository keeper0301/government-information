// ============================================================
// 정책 FAQ 변환 — 핵심정보(label/value) → 질문·답변(Q&A) (2026-06-15 CTR 개선)
// ============================================================
// 검색엔진·AI 검색이 정책 페이지를 "질문과 답"으로 이해하도록 FAQPage 구조화 데이터를
// 만든다. 입력은 상세 페이지의 filledSummary(본문과 중복 아닌 실제 정보만 걸러둔 것)라
// 정확하다. 빈 값은 자동 제외 → 정보가 충실한 페이지에만 FAQ 가 붙는다.
//
// ⚠️ 한계(정직): Google 은 2023-08 부터 FAQ 펼침(rich result)을 정부·의료 사이트로만
//   제한했다. 일반 사이트인 키피오는 검색결과에서 FAQ 가 펼쳐지지 않는다. 다만 AI 검색
//   (제미나이 등)과 네이버가 페이지 의도를 이해하는 데는 도움이 된다.

// 핵심정보 라벨 → 사용자 검색 질문. 라벨은 welfare/loan 상세 페이지 filledSummary 와 동일 표기.
const FAQ_QUESTION: Record<string, string> = {
  "자격 요건": "신청 자격은 어떻게 되나요?",
  "혜택 내용": "어떤 혜택을 받을 수 있나요?",
  "신청 기간": "신청 기간은 언제인가요?",
  "신청 방법": "어떻게 신청하나요?",
  "대출 한도": "대출 한도는 얼마인가요?",
  금리: "금리(이자)는 어떻게 되나요?",
  "상환 조건": "상환 조건은 어떻게 되나요?",
};

export function buildPolicyFaqs(
  fields: { label: string; value: string | null }[],
): { question: string; answer: string }[] {
  return fields
    .map((f) => {
      const q = FAQ_QUESTION[f.label];
      const v = f.value?.trim();
      if (!q || !v) return null;
      // schema answer 과도 길이 방지 — 500자 cut(FAQ 적정 분량).
      return { question: q, answer: v.slice(0, 500) };
    })
    .filter((x): x is { question: string; answer: string } => x !== null);
}
