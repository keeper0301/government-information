export type Program = {
  id: string;
  title: string;
  category: string;
  target: string;
  description: string;
  amount: string;
  source: string;
  dday: number | null; // null = 상시
  icon: "house" | "briefcase" | "heart" | "medical" | "coin" | "store" | "shield";
};

export const welfarePrograms: Program[] = [
  {
    id: "w1",
    title: "청년 월세 특별지원",
    category: "주거",
    target: "청년",
    description: "월 최대 20만원 · 12개월 지원 · 연소득 5천만원 이하 무주택 청년",
    amount: "월 20만원",
    source: "복지로",
    dday: 7,
    icon: "house",
  },
  {
    id: "w2",
    title: "국민취업지원제도 II유형",
    category: "취업",
    target: "전체",
    description: "구직촉진수당 월 50만원 × 6개월 · 취업활동비용 및 직업훈련 지원",
    amount: "월 50만원",
    source: "고용노동부",
    dday: null,
    icon: "briefcase",
  },
  {
    id: "w3",
    title: "부모급여 (0~1세)",
    category: "양육",
    target: "부모",
    description: "0세 월 100만원, 1세 월 50만원 · 출생신고 후 주민센터 신청",
    amount: "월 100만원",
    source: "보건복지부",
    dday: null,
    icon: "heart",
  },
  {
    id: "w4",
    title: "긴급복지 의료지원",
    category: "의료",
    target: "저소득",
    description: "위기상황 시 의료비 최대 300만원 · 입원·수술비 긴급 지원",
    amount: "최대 300만원",
    source: "복지로",
    dday: 30,
    icon: "medical",
  },
];

export const loanPrograms: Program[] = [
  {
    id: "l1",
    title: "소상공인 정책자금",
    category: "대출",
    target: "소상공인",
    description: "일반경영안정자금 · 5년 거치 5년 분할상환",
    amount: "최대 1억 · 연 2.0%",
    source: "소상공인진흥공단",
    dday: 21,
    icon: "coin",
  },
  {
    id: "l2",
    title: "경영안정자금 특별지원",
    category: "지원금",
    target: "자영업",
    description: "매출 감소 자영업자 대상 · 초저금리 지원",
    amount: "최대 5천만 · 연 1.5%",
    source: "금융위원회",
    dday: 5,
    icon: "store",
  },
  {
    id: "l3",
    title: "소상공인 신용보증",
    category: "보증",
    target: "창업",
    description: "업력 7년 이내 창업기업 대상 · 보증료 0.5%",
    amount: "최대 2억",
    source: "소상공인24",
    dday: null,
    icon: "shield",
  },
];

export const searchTags = [
  "청년 월세",
  "소상공인 대출",
  "창업 지원금",
  "긴급복지",
  "경영안정자금",
];
