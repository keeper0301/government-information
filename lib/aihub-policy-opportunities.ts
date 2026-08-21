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

export type PublicReadbackCandidate = {
  sourceName: string;
  query: string;
  searchUrl: string;
  reason: string;
  requiredBeforeDraft: true;
};

export type PolicyExportRow = PolicyTopicSeed & {
  status: "candidate" | "needs_fact_readback";
  year: 2026;
  readbackCandidateCount: number;
  readbackCandidates: PublicReadbackCandidate[];
};

const SOURCE_SEARCH_BUILDERS: Record<string, (query: string) => string> = {
  정부24: (query) => `https://www.gov.kr/search?srhQuery=${encodeURIComponent(query)}`,
  복지로: (query) => `https://www.bokjiro.go.kr/ssis-tbu/search?query=${encodeURIComponent(query)}`,
  기업마당: (query) => `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do?rows=15&keyword=${encodeURIComponent(query)}`,
  소상공인24: (query) => `https://www.sbiz24.kr/#/search?keyword=${encodeURIComponent(query)}`,
  고용24: (query) => `https://www.work24.go.kr/cm/search.do?topQuery=${encodeURIComponent(query)}`,
  보건복지부: (query) => `https://www.mohw.go.kr/search.jsp?query=${encodeURIComponent(query)}`,
  행정안전부: (query) => `https://www.mois.go.kr/search/search.jsp?query=${encodeURIComponent(query)}`,
  경찰청: (query) => `https://www.police.go.kr/search/search.do?query=${encodeURIComponent(query)}`,
  초록누리: (query) => `https://ecolife.me.go.kr/ecolife/search/totalSearch?query=${encodeURIComponent(query)}`,
  환경부: (query) => `https://www.me.go.kr/home/web/search/list.do?searchValue=${encodeURIComponent(query)}`,
  한국환경산업기술원: (query) => `https://www.keiti.re.kr/search.do?query=${encodeURIComponent(query)}`,
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
        title: template.includes("{지역명}") ? template.split("{지역명}").join(region) : `${region} ${template}`,
        needsFactReadback: true,
        aihubUrl: opportunity.aihubUrl,
        publicReadbackSources: opportunity.publicReadbackSources,
      })),
    ),
  );
}

function publicSourceReason(sourceName: string): string {
  if (sourceName.includes("지자체")) return "지역별 공고/민원 페이지에서 현재 신청 가능 여부 확인";
  if (["정부24", "복지로", "기업마당", "소상공인24", "고용24"].includes(sourceName)) return "신청 대상·기간·서류 최신성 확인";
  return "공식 기관 원문으로 정책/안전 정보 최신성 확인";
}

export function buildPublicReadbackCandidates(seed: PolicyTopicSeed): PublicReadbackCandidate[] {
  return seed.publicReadbackSources.map((sourceName) => {
    const query = `${seed.region} ${seed.title}`.replace(/\s+/g, " ").trim();
    const builder = SOURCE_SEARCH_BUILDERS[sourceName];
    const searchUrl = builder
      ? builder(query)
      : `https://www.google.com/search?q=${encodeURIComponent(`${sourceName} ${query}`)}`;
    return {
      sourceName,
      query,
      searchUrl,
      reason: publicSourceReason(sourceName),
      requiredBeforeDraft: true,
    };
  });
}

export function buildPolicyExportRows(seeds: readonly PolicyTopicSeed[] = buildPolicyTopicSeeds()): PolicyExportRow[] {
  return seeds.map((seed) => {
    const readbackCandidates = buildPublicReadbackCandidates(seed);
    return {
      ...seed,
      status: "needs_fact_readback",
      year: 2026,
      readbackCandidateCount: readbackCandidates.length,
      readbackCandidates,
    };
  });
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value)
    ? value.join(" | ")
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
  return `"${String(text ?? "").split('"').join('""')}"`;
}

export function buildPolicyExportCsv(rows: readonly PolicyExportRow[] = buildPolicyExportRows()): string {
  const headers = [
    "year",
    "status",
    "policyName",
    "region",
    "title",
    "needsFactReadback",
    "readbackCandidateCount",
    "publicReadbackSources",
    "readbackCandidateUrls",
    "aihubUrl",
  ];
  const lines = rows.map((row) =>
    [
      row.year,
      row.status,
      row.policyName,
      row.region,
      row.title,
      row.needsFactReadback,
      row.readbackCandidateCount,
      row.publicReadbackSources,
      row.readbackCandidates.map((candidate) => `${candidate.sourceName}: ${candidate.searchUrl}`),
      row.aihubUrl,
    ]
      .map(csvEscape)
      .join(","),
  );
  return `${headers.join(",")}\n${lines.join("\n")}\n`;
}
