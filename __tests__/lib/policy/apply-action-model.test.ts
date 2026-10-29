import { describe, expect, it } from "vitest";
import {
  buildApplyActionModel,
  buildOriginalBody,
  extractContactPhone,
  extractLegalBasis,
  type ApplyActionInput,
} from "@/lib/policy/apply-action-model";
import { buildDetailMatchFilters } from "@/lib/policy/detail-match";
import { isUserEventType, POLICY_DETAIL_EVENT_TYPES } from "@/lib/analytics/policy-events";

const base: ApplyActionInput = {
  title: "장수축하금 (인천광역시 계양구)",
  target: "노년·어르신",
  region: "인천광역시",
  district: "계양구",
  source: "인천광역시",
  sourceUrl: "https://www.incheon.go.kr/notice/123",
  updatedAt: "2026-04-22T01:00:00.000Z",
  eligibility: "계양구 1년 이상 거주 100세 어르신",
  benefits: "1인 100만원 (1회)",
  loanAmount: null,
  interestRate: null,
  applyMethod: "주소지 관할 동 행정복지센터에 방문\n어르신이 거동이 어려우면 방문 접수 요청 가능",
  applyUrl: null,
  applyStart: null,
  applyEnd: null,
  contactInfo: "계양구청 노인장애인과 032-450-5388",
  description: "「계양구 장수축하금 지급 조례」에 따라 지급합니다.",
  detailedContent: null,
  selectionCriteria: null,
  requiredDocuments: null,
  repaymentPeriod: null,
  dday: null,
  isClosed: false,
};

describe("신청 실행 카드 상태", () => {
  it("방문 신청은 요약 4줄, 전화 링크, 알림톡 버튼을 만든다", () => {
    const model = buildApplyActionModel(base);

    expect(model.chips).toEqual(["노년·어르신", "인천광역시 계양구"]);
    expect(model.sourceLine).toContain("출처: 인천광역시");
    expect(model.sourceLine).toContain("자료 갱신");
    expect(model.summary.who).toBe("계양구 1년 이상 거주 100세 어르신");
    expect(model.summary.amount).toBe("1인 100만원 (1회)");
    expect(model.summary.when).toEqual({ text: "상시 또는 기관 확인", urgent: false });
    expect(model.summary.when.text).not.toContain("확인 필요");
    expect(model.route).toBe("visit");
    expect(model.steps.map((step) => step.text)).toEqual([
      "주소지 관할 동 행정복지센터에 방문",
      "어르신이 거동이 어려우면 방문 접수 요청 가능",
    ]);
    expect(model.phone?.tel).toBe("tel:0324505388");
    expect(model.phone?.display).toContain("032-450-5388");
    expect(model.legalBasis).toBe("계양구 장수축하금 지급 조례");
    expect(model.audience).toBe("parent");
    expect(model.primary).toEqual({ type: "alimtalk", label: "신청 방법 알림톡 받기" });
    expect(model.secondary?.type).toBe("phone");
  });

  it("온라인 직링크는 공식 사이트 신청이 주 버튼이다", () => {
    const model = buildApplyActionModel({
      ...base,
      target: "청년",
      eligibility: "인천 거주 청년",
      applyMethod: "온라인으로 신청합니다.",
      applyUrl: "https://www.bokjiro.go.kr/ssis-tbu/apply/123",
      applyEnd: "2026-12-31",
      dday: 40,
      contactInfo: null,
    });

    expect(model.route).toBe("online");
    expect(model.audience).toBe("self");
    expect(model.primary).toMatchObject({
      type: "apply",
      label: "공식 사이트에서 신청하기",
      href: "https://www.bokjiro.go.kr/ssis-tbu/apply/123",
    });
    expect(model.secondary).toMatchObject({ type: "source", label: "출처 보기" });
    expect(model.contactAction?.type).toBe("source");
    expect(model.phone).toBeNull();
  });

  it("D-7 이하면 언제 줄을 D-n 으로 표시한다", () => {
    const model = buildApplyActionModel({
      ...base,
      applyEnd: "2026-11-05",
      dday: 7,
    });
    expect(model.summary.when).toEqual({ text: "D-7", urgent: true });
  });

  it("마감일이 없으면 확인 필요를 강조하지 않는다", () => {
    const model = buildApplyActionModel({
      ...base,
      applyStart: null,
      applyEnd: null,
      dday: null,
    });
    expect(model.summary.when.text).toBe("상시 또는 기관 확인");
    expect(JSON.stringify(model)).not.toContain("확인 필요");
    expect(JSON.stringify(model)).not.toContain("검수 전");
  });

  it("마감된 공고는 신청 링크 대신 공식 공고를 연다", () => {
    const model = buildApplyActionModel({
      ...base,
      applyUrl: "https://www.bokjiro.go.kr/ssis-tbu/apply/123",
      applyMethod: "온라인으로 신청합니다.",
      applyEnd: "2026-01-01",
      isClosed: true,
      dday: null,
    });
    expect(model.summary.when.text).toContain("마감됨");
    expect(model.summary.when.urgent).toBe(true);
    expect(model.primary.type).toBe("source");
    expect(model.primary.type === "source" ? model.primary.label : "").toBe("공식 공고 보기");
  });

  it("금액과 근거가 없으면 만들지 않는다", () => {
    const model = buildApplyActionModel({
      ...base,
      benefits: null,
      loanAmount: null,
      interestRate: null,
      description: "대상자에게 지원합니다.",
      title: "생활 지원",
    });
    expect(model.summary.amount).toBe("공식 공고의 지원 내용");
    expect(model.summary.amount).not.toMatch(/\d/);
    expect(model.legalBasis).toBeNull();
  });

  it("대출 한도와 금리는 있는 값만 잇는다", () => {
    const model = buildApplyActionModel({
      ...base,
      benefits: null,
      loanAmount: "최대 5천만원",
      interestRate: "2%",
    });
    expect(model.summary.amount).toBe("최대 5천만원 · 금리 2%");
  });

  it("요약과 같은 문단은 원문에서 뺀다", () => {
    const body = buildOriginalBody(
      ["계양구 1년 이상 거주 100세 어르신", "지급일은 생일 달 말일이다.", "지급일은 생일 달 말일이다."],
      ["계양구 1년 이상 거주 100세 어르신"],
    );
    expect(body).toBe("지급일은 생일 달 말일이다.");
  });

  it("전화번호가 없으면 null 이다", () => {
    expect(extractContactPhone("이메일 only@example.com", "기관")).toBeNull();
    expect(extractLegalBasis("근거 법령 없음")).toBeNull();
  });
});

describe("상세 매칭 필터와 이벤트 이름", () => {
  it("지역·나이가 있으면 전국·전연령을 함께 센다", () => {
    expect(buildDetailMatchFilters({ region: "인천", ageGroup: "20대" })).toMatchObject({
      ageTags: ["청년", "전연령"],
    });
    expect(buildDetailMatchFilters({ region: "전국", ageGroup: null })).toBeNull();
    expect(buildDetailMatchFilters({ region: null, ageGroup: null })).toBeNull();
  });

  it("신청 행동 이벤트는 정책 id 와 함께 기록할 수 있는 이름이다", () => {
    for (const name of POLICY_DETAIL_EVENT_TYPES) {
      expect(isUserEventType(name)).toBe(true);
    }
    expect(POLICY_DETAIL_EVENT_TYPES).toEqual([
      "program_view",
      "apply_click",
      "apply_call_click",
      "apply_visit_info_view",
      "alimtalk_signup_click",
      "signup_from_detail",
    ]);
  });
});
