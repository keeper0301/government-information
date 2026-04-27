// ============================================================
// 카카오 i 오픈빌더 webhook 헬퍼 — 단위 테스트 가능하게 분리
// ============================================================
// app/api/kakao/skill/route.ts 가 import.
// route.ts 는 NextResponse·Supabase 의존성 포함이라 단위 테스트 부담이 큼.
// 의도 매칭·KST 시각·필드 슬라이스 같은 순수 함수만 이 파일에 모아 테스트.
// ============================================================

// 사용자 의도 5종 + null(fallback)
export type KakaoIntent = "welfare" | "loan" | "quiz" | "youth" | "business" | null;

// 카카오 i 오픈빌더 quickReplies — 5개 의도 빠른 진입.
// route.ts 의 모든 응답에 포함됨.
export const KAKAO_QUICK_REPLIES = [
  { label: "복지", action: "message", messageText: "복지" },
  { label: "대출", action: "message", messageText: "대출" },
  { label: "청년", action: "message", messageText: "청년" },
  { label: "사장님", action: "message", messageText: "사장님" },
  { label: "1분 진단", action: "message", messageText: "1분 진단" },
] as const;

// KST 오늘 (YYYY-MM-DD) — apply_end 비교용.
// new Date().toISOString() 은 UTC 기준이라, 한국 자정 직후(KST 0~9시)에는
// today 가 KST 기준 어제로 잡혀 마감된 정책이 "마감 임박" 으로 잘못 노출.
// → UTC 에 +9h 더해 KST Date 생성 후 ISO 슬라이스.
export function getKstToday(now: Date = new Date()): string {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kstNow.toISOString().slice(0, 10);
}

// 사용자 발화 → 의도 분류
// 우선순위: 1분 진단 > 청년 > 사장님 > 대출 > 복지 (사장님 의도 결정)
// 단순 includes 기반 (정규식 부담 회피, 짧은 발화에 충분)
export function matchIntent(utterance: string): KakaoIntent {
  const u = utterance.toLowerCase().replace(/\s+/g, "");

  // 1분 진단 — 가장 높은 우선순위 (사용자 자신을 알려준다는 시그널)
  if (
    u.includes("진단") ||
    u.includes("추천") ||
    u.includes("내게") ||
    u.includes("나에게") ||
    u.includes("맞춤") ||
    u.includes("나한테")
  ) {
    return "quiz";
  }

  // 청년 — 대상 키워드 (loan/welfare 둘 다에서 검색)
  if (u.includes("청년")) return "youth";

  // 사장님·소상공인·자영업자
  if (u.includes("사장") || u.includes("소상공인") || u.includes("자영업")) {
    return "business";
  }

  // 대출·자금·지원금
  if (u.includes("대출") || u.includes("자금") || u.includes("지원금")) {
    return "loan";
  }

  // 복지·보조금·혜택
  if (u.includes("복지") || u.includes("보조금") || u.includes("혜택")) {
    return "welfare";
  }

  return null;
}

// fallback 응답에 사용자 발화를 echo 할 때 phishing URL 제거 + 길이 제한.
// "https://악성사이트.kr 클릭" 같은 발화가 그대로 카톡에 노출되면 위험.
export function safeEchoUtterance(utterance: string, maxLen: number = 30): string {
  return utterance.replace(/https?:\/\/\S+/gi, "").slice(0, maxLen).trim();
}

// listCard description 포맷 — target + dday 라벨 결합.
// dday < 0: "마감", === 0: "오늘 마감", > 0: "D-N"
export function formatDday(dday: number | null | undefined): string | null {
  if (dday == null) return null;
  if (dday < 0) return "마감";
  if (dday === 0) return "오늘 마감";
  return `D-${dday}`;
}

// 카카오 listCard.items[i].description 빌드 — 카카오 정책 40자 제한.
export function buildListCardDescription(
  target: string | null | undefined,
  dday: number | null | undefined,
): string {
  const parts = [target || "전체", formatDday(dday)].filter(Boolean);
  return parts.join(" · ").slice(0, 40);
}
