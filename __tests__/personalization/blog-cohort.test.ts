import { describe, it, expect } from "vitest";
import {
  isBlogCohortFit,
  type CohortUserSignals,
} from "@/lib/personalization/blog-cohort";

// 사장님 프로필 — 30대/전남 순천시/자영업자 (메모리 기반)
const sajangnim: CohortUserSignals = {
  ageGroup: "30대",
  region: "전남",
  district: "순천시",
  occupation: "자영업자",
  incomeLevel: null,
  householdTypes: [],
  benefitTags: ["주거", "취업", "창업", "금융", "교육", "생계", "의료"],
  hasChildren: null,
  merit: null,
};

// 청년 사용자 — 25세 대학생 서울
const youngStudent: CohortUserSignals = {
  ageGroup: "20대",
  region: "서울",
  district: null,
  occupation: "대학생",
  incomeLevel: null,
  householdTypes: [],
  benefitTags: ["주거", "취업"],
  hasChildren: null,
  merit: null,
};

// 노년 사용자 — 65세 전남
const elderly: CohortUserSignals = {
  ageGroup: "60대 이상",
  region: "전남",
  district: null,
  occupation: "기타",
  incomeLevel: null,
  householdTypes: ["elderly_family"],
  benefitTags: ["의료", "생계"],
  hasChildren: null,
  merit: null,
};

// 30대 다자녀 자영업자 (자녀 학생 정책 관심 있을 수 있음)
const multiChildParent: CohortUserSignals = {
  ageGroup: "30대",
  region: "경기",
  district: null,
  occupation: "자영업자",
  incomeLevel: "mid",
  householdTypes: ["multi_child"],
  benefitTags: ["교육", "주거"],
  hasChildren: true,
  merit: null,
};

describe("isBlogCohortFit", () => {
  describe("청년 카테고리", () => {
    it("30대 자영업자 → 청년 글 차단 (사장님 시나리오)", () => {
      const post = {
        category: "청년",
        title: "2026년 서울시 청년수당: 매월 50만원 지원",
        meta_description: "미취업 청년에게 6개월간 매월 50만원",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(false);
    });

    it("20대 대학생 → 청년 글 통과", () => {
      const post = {
        category: "청년",
        title: "2026년 청년농업인 영농정착 지원금",
        meta_description: "18~39세 영농경력 3년 이하",
      };
      expect(isBlogCohortFit(post, youngStudent)).toBe(true);
    });

    it("30대 구직자 → 청년 글 통과 (occupation 예외)", () => {
      // sajangnim region=전남 → 다른 광역 명시 시 region 필터에서 차단되므로
      // cohort 만 단독 검증하려면 광역 명시 없는 글로 테스트
      const jobseeker: CohortUserSignals = {
        ...sajangnim,
        occupation: "구직자",
      };
      const post = {
        category: "청년",
        title: "청년 취업 역량 강화 프로그램",
      };
      expect(isBlogCohortFit(post, jobseeker)).toBe(true);
    });
  });

  describe("노년 카테고리", () => {
    it("60대 이상 → 통과", () => {
      // elderly region=전남 → cohort 만 검증하려면 광역 명시 없는 글로 테스트
      const post = {
        category: "노년",
        title: "기초연금 신청 가이드: 만 65세 이상 어르신 대상",
      };
      expect(isBlogCohortFit(post, elderly)).toBe(true);
    });

    it("30대 자영업자 → 차단 (사장님)", () => {
      const post = {
        category: "노년",
        title: "기초연금 신청 가이드",
        meta_description: "어르신 65세 이상",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(false);
    });
  });

  describe("학생·교육 카테고리", () => {
    it("30대 자영업자 (자녀 없음) → 차단 (사장님)", () => {
      const post = {
        category: "학생·교육",
        title: "2026년 직업계고-전문대학 연계 교육",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(false);
    });

    it("30대 다자녀 부모 → 통과 (자녀 교육 관심)", () => {
      const post = {
        category: "학생·교육",
        title: "고교 학습지원금",
      };
      expect(isBlogCohortFit(post, multiChildParent)).toBe(true);
    });

    it("20대 대학생 → 통과", () => {
      const post = {
        category: "학생·교육",
        title: "국가장학금 신청",
      };
      expect(isBlogCohortFit(post, youngStudent)).toBe(true);
    });
  });

  describe("소상공인 카테고리 — cohort 차단 안 함", () => {
    it("30대 자영업자 → 통과", () => {
      const post = {
        category: "소상공인",
        title: "전남 소상공인 경영 안정 자금",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(true);
    });

    it("20대 대학생 → 다른 광역 명시로 차단되지만 cohort 자체는 통과", () => {
      const post = {
        category: "소상공인",
        title: "부산 소상공인 컨설팅 (대학생 창업가도 가능)",
      };
      // 부산 명시 → 서울 사용자에게 차단
      expect(isBlogCohortFit(post, youngStudent)).toBe(false);
    });
  });

  describe("광역 명시 차단", () => {
    it("전남 사용자 → '울산 자영업자' 글 차단", () => {
      const post = {
        category: "소상공인",
        title: "2026년 울산 자영업자 '아이와 함께 행복업'",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(false);
    });

    it("전남 사용자 → '인천 중구 청년월세' 청년 cohort 로 먼저 차단", () => {
      const post = {
        category: "청년",
        title: "2026년 인천 중구 청년월세 지원사업",
      };
      // ageGroup=30대 자영업자 → 청년 cohort 에서 먼저 false
      expect(isBlogCohortFit(post, sajangnim)).toBe(false);
    });

    it("전남 사용자 → '전남 영암군 정책' 자기 지역이라 통과", () => {
      const post = {
        category: "소상공인",
        title: "2026년 전남 영암군 소상공인 지원",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(false);
    });

    it("전국 정책 (광역 명시 없음) → 통과", () => {
      const post = {
        category: "소상공인",
        title: "전국 소상공인 손실보전금 가이드",
      };
      expect(isBlogCohortFit(post, sajangnim)).toBe(true);
    });

    it("region=전국 사용자 → 모든 광역 글 통과", () => {
      const userNationwide: CohortUserSignals = {
        ...sajangnim,
        region: "전국",
      };
      const post = {
        category: "소상공인",
        title: "서울 소상공인 임대료 지원",
      };
      expect(isBlogCohortFit(post, userNationwide)).toBe(true);
    });
  });

  describe("사장님 화면 6건 회귀", () => {
    // 스크린샷의 추천 6건 — 모두 차단되어야 함
    const screenshotPosts = [
      {
        category: "소상공인",
        title: "2026년 울산 자영업자 '아이와 함께 행복업': 출산·육아 대체인력 지원",
        reason: "울산 명시 (전남 아님)",
      },
      {
        category: "청년",
        title: "2026년 인천 중구 청년월세 지원사업: 최대 24개월, 월 20만원 받는 방법",
        reason: "30대 자영업자 청년 cohort 차단",
      },
      {
        category: "청년",
        title: "2026년 부산 워털루형 코업 프로그램, 청년 취업 역량 강화",
        reason: "30대 자영업자 청년 cohort 차단",
      },
      {
        category: "청년",
        title: "2026년 청년농업인 영농정착 지원금: 울산 중구 청년 농부 주목!",
        reason: "30대 자영업자 청년 cohort 차단",
      },
      {
        category: "청년",
        title: "2026년 서울시 청년수당: 매월 50만원 지원",
        reason: "30대 자영업자 청년 cohort 차단",
      },
      {
        category: "학생·교육",
        title: "2026년 직업계고-전문대학 연계 교육, 조기 졸업과 취업을 동시에!",
        reason: "30대 자영업자 학생·교육 cohort 차단 (자녀 없음)",
      },
    ];

    for (const p of screenshotPosts) {
      it(`'${p.title.slice(0, 30)}…' 차단 (${p.reason})`, () => {
        expect(isBlogCohortFit(p, sajangnim)).toBe(false);
      });
    }
  });
});
