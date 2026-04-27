import { describe, it, expect } from "vitest";
import {
  buildListCardDescription,
  formatDday,
  getKstToday,
  KAKAO_QUICK_REPLIES,
  matchIntent,
  safeEchoUtterance,
} from "@/lib/kakao-skill";

// ============================================================
// matchIntent — 5개 의도 분류 + 우선순위
// ============================================================
describe("matchIntent", () => {
  // 1분 진단 (가장 높은 우선순위)
  it("'1분 진단' → quiz", () => {
    expect(matchIntent("1분 진단")).toBe("quiz");
  });
  it("'추천' → quiz", () => {
    expect(matchIntent("추천 받고 싶어요")).toBe("quiz");
  });
  it("'나에게 맞는' → quiz", () => {
    expect(matchIntent("나에게 맞는 정책")).toBe("quiz");
  });
  it("'맞춤' → quiz", () => {
    expect(matchIntent("맞춤 정책")).toBe("quiz");
  });

  // 청년 (quiz 다음 우선순위)
  it("'청년' → youth", () => {
    expect(matchIntent("청년")).toBe("youth");
  });
  it("'청년 대출' → youth (loan 보다 청년 우선)", () => {
    expect(matchIntent("청년 대출")).toBe("youth");
  });
  it("'청년 진단' → quiz (quiz 가 youth 보다 우선)", () => {
    expect(matchIntent("청년 진단")).toBe("quiz");
  });

  // 사장님·소상공인·자영업자
  it("'사장님' → business", () => {
    expect(matchIntent("사장님")).toBe("business");
  });
  it("'소상공인' → business", () => {
    expect(matchIntent("소상공인 지원")).toBe("business");
  });
  it("'자영업자' → business", () => {
    expect(matchIntent("자영업자 도와주세요")).toBe("business");
  });

  // 대출
  it("'대출' → loan", () => {
    expect(matchIntent("대출")).toBe("loan");
  });
  it("'자금' → loan", () => {
    expect(matchIntent("창업 자금")).toBe("loan");
  });
  it("'지원금' → loan", () => {
    expect(matchIntent("지원금 알려줘")).toBe("loan");
  });

  // 복지 (가장 낮은 우선순위)
  it("'복지' → welfare", () => {
    expect(matchIntent("복지")).toBe("welfare");
  });
  it("'보조금' → welfare", () => {
    expect(matchIntent("보조금 받고 싶어")).toBe("welfare");
  });
  it("'혜택' → welfare", () => {
    expect(matchIntent("혜택 안내")).toBe("welfare");
  });

  // fallback
  it("키워드 없음 → null", () => {
    expect(matchIntent("안녕하세요")).toBeNull();
  });
  it("빈 문자열 → null", () => {
    expect(matchIntent("")).toBeNull();
  });

  // 공백·대소문자 무관
  it("공백 무시", () => {
    expect(matchIntent("  복   지  ")).toBe("welfare");
  });
});

// ============================================================
// getKstToday — UTC 기준 +9h KST 환산
// ============================================================
describe("getKstToday", () => {
  it("UTC 자정 → KST 09:00 같은 날", () => {
    const utcMidnight = new Date("2026-04-27T00:00:00Z");
    expect(getKstToday(utcMidnight)).toBe("2026-04-27");
  });

  it("UTC 14:00 → KST 23:00 같은 날", () => {
    const utc14 = new Date("2026-04-27T14:00:00Z");
    expect(getKstToday(utc14)).toBe("2026-04-27");
  });

  it("UTC 15:00 → KST 다음날 00:00", () => {
    // KST 자정 직후 0~9시 사이에 UTC 기준은 전날.
    // 이 시간대에 today 가 KST 기준으로 잡히는지 검증.
    const utc15 = new Date("2026-04-26T15:00:00Z");
    expect(getKstToday(utc15)).toBe("2026-04-27");
  });

  it("UTC 23:59 → KST 다음날 08:59", () => {
    const utc23_59 = new Date("2026-04-26T23:59:59Z");
    expect(getKstToday(utc23_59)).toBe("2026-04-27");
  });
});

// ============================================================
// safeEchoUtterance — phishing URL 제거 + 길이 제한
// ============================================================
describe("safeEchoUtterance", () => {
  it("URL 제거", () => {
    expect(safeEchoUtterance("클릭 https://malicious.com 하세요")).toBe(
      "클릭  하세요",
    );
  });
  it("http URL 도 제거", () => {
    expect(safeEchoUtterance("http://bad.kr 보세요")).toBe("보세요");
  });
  it("URL 여러 개 제거", () => {
    expect(safeEchoUtterance("https://a.com https://b.com 끝")).toBe("끝");
  });
  it("기본 길이 30자 제한", () => {
    const long = "a".repeat(50);
    expect(safeEchoUtterance(long)).toHaveLength(30);
  });
  it("커스텀 길이 제한", () => {
    expect(safeEchoUtterance("abcdefghij", 5)).toBe("abcde");
  });
  it("trim 적용", () => {
    expect(safeEchoUtterance("   안녕   ")).toBe("안녕");
  });
});

// ============================================================
// formatDday — D-N / 오늘 마감 / 마감 / null
// ============================================================
describe("formatDday", () => {
  it("D-7", () => expect(formatDday(7)).toBe("D-7"));
  it("D-1", () => expect(formatDday(1)).toBe("D-1"));
  it("0 → 오늘 마감", () => expect(formatDday(0)).toBe("오늘 마감"));
  it("음수 → 마감", () => expect(formatDday(-3)).toBe("마감"));
  it("null → null", () => expect(formatDday(null)).toBeNull());
  it("undefined → null", () => expect(formatDday(undefined)).toBeNull());
});

// ============================================================
// buildListCardDescription — 카카오 listCard.description 40자 제한
// ============================================================
describe("buildListCardDescription", () => {
  it("target + dday 결합", () => {
    expect(buildListCardDescription("청년", 7)).toBe("청년 · D-7");
  });
  it("target 없으면 '전체'", () => {
    expect(buildListCardDescription(null, 5)).toBe("전체 · D-5");
  });
  it("dday null 이면 target 만", () => {
    expect(buildListCardDescription("소상공인", null)).toBe("소상공인");
  });
  it("40자 초과 시 슬라이스", () => {
    const longTarget = "가".repeat(50);
    const result = buildListCardDescription(longTarget, 7);
    expect(result.length).toBeLessThanOrEqual(40);
  });
  it("'오늘 마감' 표기", () => {
    expect(buildListCardDescription("청년", 0)).toBe("청년 · 오늘 마감");
  });
  it("음수 dday → '마감'", () => {
    expect(buildListCardDescription("청년", -1)).toBe("청년 · 마감");
  });
});

// ============================================================
// KAKAO_QUICK_REPLIES — 5종 메뉴 무결성
// ============================================================
describe("KAKAO_QUICK_REPLIES", () => {
  it("5종 메뉴", () => {
    expect(KAKAO_QUICK_REPLIES).toHaveLength(5);
  });
  it("각 메뉴는 label + action + messageText", () => {
    for (const reply of KAKAO_QUICK_REPLIES) {
      expect(reply).toHaveProperty("label");
      expect(reply).toHaveProperty("action", "message");
      expect(reply).toHaveProperty("messageText");
    }
  });
  it("messageText 가 matchIntent 와 일치 (round-trip)", () => {
    // 사용자가 quickReply 클릭 → messageText 가 발화로 들어옴 → matchIntent 가
    // null 반환하면 fallback. 모든 quickReply 가 의도 매칭 되는지 검증.
    for (const reply of KAKAO_QUICK_REPLIES) {
      expect(matchIntent(reply.messageText)).not.toBeNull();
    }
  });
});
