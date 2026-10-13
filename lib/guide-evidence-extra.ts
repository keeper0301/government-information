import type { GuideEvidence } from "@/lib/guide-evidence";

// 검수 가능한 출처 범위를 좁혀 기록합니다. 아래 두 글도 사람 검수 전입니다.
export const EXTRA_GUIDE_EVIDENCE: Record<string, GuideEvidence> = {
  "geunjang-earned-income-tax-credit-check": {
    verifiedBodySha256: "e043c559eb321af8311eb62c53474734511d9f8c5ee21528c98d7f9f0cb26869",
    question: "근로장려금 정기 신청과 반기 신청은 어떻게 구분하나요?",
    answer: "소득 종류부터 확인하세요. 국세청은 근로소득만 있는 사람의 정기·반기 선택과 사업·종교인소득이 있는 사람의 정기 신청을 구분합니다.",
    categorySlugs: ["business", "youth"], status: "source-checked", actualUpdatedAt: "2026-10-05", ownerReviewed: false,
    sources: [{ agency: "국세청", title: "근로·자녀장려금 신청기간 및 방법",
      url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=238977&mi=40397",
      scope: "소득 종류에 따른 정기·반기 신청 구분과 신청방법. 이 글에서 금액·현재 접수 상태는 확정하지 않습니다.", checkedAt: "2026-10-05" }],
    conditions: [
      { item: "근로소득만 있는 경우", fact: "정기 신청과 반기 신청을 선택하여 신청할 수 있다고 안내합니다.", interpretation: "귀속연도와 해당 유형의 접수기간·가구·소득·재산 기준은 별도로 확인하세요." },
      { item: "사업·종교인소득이 있는 경우", fact: "정기 신청을 하도록 안내합니다.", interpretation: "직업 이름이 아니라 홈택스에 확인되는 소득 종류를 대조하세요." },
      { item: "안내문을 받지 않은 경우", fact: "홈택스 직접입력 신청 경로가 안내되어 있습니다.", interpretation: "안내문 여부가 지급 자격을 뜻하지 않습니다. 유형과 자격을 따로 확인하세요." },
    ],
    headings: ["신청 유형을 먼저 확인", "귀속연도와 소득 정리", "정기·반기의 차이", "안내문 없는 경우", "문의 전 준비 메모"],
    changeLog: "범용 서류 설명을 걷어내고 국세청 직접 출처를 바탕으로 정기·반기 구분과 문의 순서를 정리했습니다.",
  },
  "policy-duplicate-benefit-limits": {
    verifiedBodySha256: "6d76ce15101fd475f87eceb0e1a8c8a3fef8524dd21ee2f841aaaae173e91d88",
    question: "지원금 두 개를 함께 받을 수 있는지 어디부터 확인하나요?",
    answer: "두 사업의 기관·지역·회차와 중복 제한 문구를 나란히 적으세요. 빠진 조건은 각 담당 기관에 확인해야 합니다.",
    categorySlugs: ["business", "youth", "housing", "senior"], status: "source-checked", actualUpdatedAt: "2026-10-05", ownerReviewed: false,
    sources: [{ agency: "한국사회보장정보원 · 복지로", title: "복지로 소개 — 복지서비스 찾기와 신청 안내",
      url: "https://www.bokjiro.go.kr/ssis-tbu/cms/pc/intro/intro/info/01/index.html",
      scope: "복지서비스 검색·상세 조회 기능에 대한 설명만 확인했습니다. 특정 사업의 중복 수급 기준을 확인한 자료는 아닙니다.", checkedAt: "2026-10-05" }],
    conditions: [
      { item: "서비스 찾기", fact: "복지로는 복지서비스 검색과 상세 안내를 제공합니다.", interpretation: "각 사업의 정확한 이름과 담당 기관을 찾는 출발점으로 사용하세요." },
      { item: "중복 제한 판단", fact: "이 출처는 모든 지원사업의 공통 중복 허용 기준을 정하지 않습니다.", interpretation: "기수혜자 제외·동일 비용·지원액 차감 문구를 두 사업에서 각각 확인하세요." },
      { item: "키피오의 준비 방법", fact: "기관의 선정 판단을 대신하지 않습니다.", interpretation: "사업명·기관·지역·회차·기간·지원 비용·담당자 확인 결과를 비교표로 적으세요." },
    ],
    headings: ["동시 수령을 먼저 단정하지 않기", "같은 사업인지 구분하기", "두 사업의 조건 비교표", "담당자에게 물어볼 질문", "답변의 적용 범위 기록"],
    changeLog: "동시 수령 가능성을 추측하지 않고 두 공고의 제한 문구를 대조하는 준비표와 문의 문안으로 수정했습니다.",
  },
};
