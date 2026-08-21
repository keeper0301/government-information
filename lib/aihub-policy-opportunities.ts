export type PolicyAudience = "공공서비스 이용자" | "청년" | "소상공인" | "노인·돌봄" | "생활안전";

export type RegionScalability = "높음" | "중간~높음" | "중간";

export type AihubPolicyOpportunity = {
  policyName: string;
  audience: PolicyAudience;
  regionScalability: RegionScalability;
  blogfuryContent: string[];
  searchKeywords: string[];
  monitoringCadence: "주 1회" | "월 1회" | "월 1회 + 정책 변경 시";
  factReadback: "필요" | "강하게 필요";
  aihubUrl: string;
  publicReadbackSources: string[];
  sourceUse: "글감 구조" | "FAQ 보조" | "신청요건 해석 보조" | "생활안전 글감";
};

export type PolicyTopicSeed = {
  policyName: string;
  region: string;
  title: string;
  needsFactReadback: true;
  aihubUrl: string;
  publicReadbackSources: string[];
};

export const AIHUB_POLICY_OPPORTUNITIES: AihubPolicyOpportunity[] = [
  {
    policyName: "공공분야 고객응대 데이터",
    audience: "공공서비스 이용자",
    regionScalability: "높음",
    blogfuryContent: ["{지역명} 주민센터 민원 상담 방법", "{지역명} 공공서비스 신청 FAQ", "{지역명} 복지 신청 전 확인할 것"],
    searchKeywords: ["공공서비스", "민원", "주민센터", "신청방법", "FAQ"],
    monitoringCadence: "주 1회",
    factReadback: "필요",
    aihubUrl: "https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=71615",
    publicReadbackSources: ["정부24", "복지로", "지자체 민원/보도자료"],
    sourceUse: "FAQ 보조",
  },
  {
    policyName: "금융, 법률 문서 기계독해 데이터",
    audience: "소상공인",
    regionScalability: "중간~높음",
    blogfuryContent: ["2026 청년 지원금 신청 조건", "2026 소상공인 지원사업 제출서류", "복지급여 신청 전 확인할 법률 용어"],
    searchKeywords: ["지원금 조건", "신청 자격", "제출서류", "소상공인", "청년"],
    monitoringCadence: "월 1회 + 정책 변경 시",
    factReadback: "강하게 필요",
    aihubUrl: "https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=71610",
    publicReadbackSources: ["기업마당", "소상공인24", "고용24", "정부24"],
    sourceUse: "신청요건 해석 보조",
  },
  {
    policyName: "독거노인 돌봄용 위험감지 데이터",
    audience: "노인·돌봄",
    regionScalability: "높음",
    blogfuryContent: ["{지역명} 독거노인 돌봄서비스 신청 방법", "{지역명} 노인맞춤돌봄서비스 대상", "{지역명} 어르신 안전확인 서비스"],
    searchKeywords: ["독거노인", "노인맞춤돌봄", "어르신", "돌봄서비스", "복지"],
    monitoringCadence: "주 1회",
    factReadback: "필요",
    aihubUrl: "https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=71803",
    publicReadbackSources: ["복지로", "보건복지부", "지자체 복지 공고"],
    sourceUse: "글감 구조",
  },
  {
    policyName: "다각도 CCTV 생활안전 데이터",
    audience: "생활안전",
    regionScalability: "높음",
    blogfuryContent: ["{지역명} 생활안전 CCTV 확인 방법", "{지역명} 안심귀가 서비스", "{지역명} 여성안심귀갓길 정보"],
    searchKeywords: ["생활안전", "CCTV", "안심귀가", "안전서비스", "지역안전"],
    monitoringCadence: "월 1회",
    factReadback: "필요",
    aihubUrl: "https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=71953",
    publicReadbackSources: ["행정안전부", "경찰청", "지자체 안전/생활안전 페이지"],
    sourceUse: "생활안전 글감",
  },
  {
    policyName: "생활화학제품 주성분 건강유해성 데이터",
    audience: "생활안전",
    regionScalability: "중간",
    blogfuryContent: ["생활화학제품 안전 확인 방법", "어린이집/가정용 세제 성분 확인", "생활용품 유해성 조회 방법"],
    searchKeywords: ["생활화학제품", "안전확인", "유해성", "환경부", "제품안전"],
    monitoringCadence: "월 1회",
    factReadback: "강하게 필요",
    aihubUrl: "https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=71916",
    publicReadbackSources: ["초록누리", "환경부", "한국환경산업기술원"],
    sourceUse: "글감 구조",
  },
];

export const POLICY_MONITOR_REGIONS = ["서울특별시 강남구", "경기도 수원시", "부산광역시 해운대구", "전라남도 순천시"] as const;

export function getPrimaryPolicyOpportunities(limit = 5): AihubPolicyOpportunity[] {
  return AIHUB_POLICY_OPPORTUNITIES.slice(0, limit);
}

export function buildPolicyTopicSeeds(
  regions: readonly string[] = POLICY_MONITOR_REGIONS,
  opportunities: readonly AihubPolicyOpportunity[] = AIHUB_POLICY_OPPORTUNITIES,
): PolicyTopicSeed[] {
  return opportunities.flatMap((opportunity) =>
    regions.flatMap((region) =>
      opportunity.blogfuryContent.slice(0, 2).map((template) => ({
        policyName: opportunity.policyName,
        region,
        title: template.includes("{지역명}") ? template.replaceAll("{지역명}", region) : `${region} ${template}`,
        needsFactReadback: true,
        aihubUrl: opportunity.aihubUrl,
        publicReadbackSources: opportunity.publicReadbackSources,
      })),
    ),
  );
}
