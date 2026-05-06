// app/admin/recommendation-trace/personas.ts
// ============================================================
// 추천 진단용 가상 페르소나 6 개 정의
// ============================================================
// 각 페르소나가 서로 다른 cohort gate 를 트리거 — false positive / negative
// 패턴 노출용. 6 + 사장님 본인 = 7 케이스 × 4 영역 = 28 baseline.
// ============================================================

import type { UserSignals } from "@/lib/personalization/types";

export type PersonaId =
  | "self"        // 사장님 본인 (DB fetch)
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6";

export type Persona = {
  id: Exclude<PersonaId, "self">;
  label: string;
  description: string;
  signals: UserSignals;
};

export const PERSONAS: Persona[] = [
  {
    id: "p2",
    label: "30대 서울 직장인 신혼",
    description: "양육 관심, married, 자녀 없음 — 신혼·청년·직장인 cohort 트리거",
    signals: {
      ageGroup: "30대",
      region: "서울",
      district: null,
      occupation: "직장인",
      incomeLevel: null,
      householdTypes: ["married"],
      benefitTags: ["양육"],
      hasChildren: null,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p3",
    label: "60대 부산 농어민 자녀동반",
    description: "노년·농어민·아동 cohort 트리거",
    signals: {
      ageGroup: "60대 이상",
      region: "부산",
      district: null,
      occupation: "농어민",
      incomeLevel: null,
      householdTypes: [],
      benefitTags: [],
      hasChildren: true,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p4",
    label: "20대 서울 대학생 single",
    description: "청년·대학생·single cohort 트리거",
    signals: {
      ageGroup: "20대",
      region: "서울",
      district: null,
      occupation: "대학생",
      incomeLevel: null,
      householdTypes: ["single"],
      benefitTags: ["교육"],
      hasChildren: false,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p5",
    label: "40대 경기 한부모 다자녀",
    description: "한부모·다자녀·아동 cohort 트리거",
    signals: {
      ageGroup: "40대",
      region: "경기",
      district: null,
      occupation: "직장인",
      incomeLevel: "low",
      householdTypes: ["single_parent", "multi_child"],
      benefitTags: ["양육", "주거"],
      hasChildren: true,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p6",
    label: "50대 충남 장애가구 보훈",
    description: "장애·보훈 cohort 트리거",
    signals: {
      ageGroup: "50대",
      region: "충남",
      district: null,
      occupation: "직장인",
      incomeLevel: null,
      householdTypes: ["disabled_family"],
      benefitTags: ["의료"],
      hasChildren: null,
      merit: "merit",
      businessProfile: null,
    },
  },
];

export function findPersona(id: string): Persona | null {
  return PERSONAS.find((p) => p.id === id) ?? null;
}
