const PROVINCE_GOVERNMENT_NAMES: Record<string, string> = {
  서울특별시: "서울특별시청",
  부산광역시: "부산광역시청",
  대구광역시: "대구광역시청",
  인천광역시: "인천광역시청",
  광주광역시: "광주광역시청",
  대전광역시: "대전광역시청",
  울산광역시: "울산광역시청",
  세종특별자치시: "세종특별자치시청",
  경기도: "경기도청",
  강원도: "강원도청",
  강원특별자치도: "강원특별자치도청",
  충청북도: "충청북도청",
  충청남도: "충청남도청",
  전라북도: "전라북도청",
  전북특별자치도: "전북특별자치도청",
  전라남도: "전남도청",
  경상북도: "경상북도청",
  경상남도: "경상남도청",
  제주특별자치도: "제주특별자치도청",
};

export function ministryToSourceName(ministry: string | null | undefined): string {
  if (!ministry) return "광역 보도자료";
  const trimmed = ministry.trim();
  if (!trimmed) return "광역 보도자료";
  if (PROVINCE_GOVERNMENT_NAMES[trimmed]) return PROVINCE_GOVERNMENT_NAMES[trimmed];
  if (trimmed.endsWith("청")) return trimmed;
  if (trimmed.endsWith("시") || trimmed.endsWith("군") || trimmed.endsWith("구")) return `${trimmed}청`;
  if (trimmed.endsWith("도")) return `${trimmed}청`;
  return trimmed;
}

export function formatSourceName(source: string | null | undefined): string {
  if (!source) return "";
  return source
    .replace(/전라남도도청/g, "전남도청")
    .replace(/전라남도청/g, "전남도청")
    .replace(/전라북도도청/g, "전라북도청")
    .replace(/경상남도도청/g, "경상남도청")
    .replace(/경상북도도청/g, "경상북도청")
    .replace(/충청남도도청/g, "충청남도청")
    .replace(/충청북도도청/g, "충청북도청")
    .replace(/강원도도청/g, "강원도청")
    .replace(/경기도도청/g, "경기도청")
    .replace(/제주특별자치도도청/g, "제주특별자치도청")
    .replace(/전북특별자치도도청/g, "전북특별자치도청")
    .replace(/강원특별자치도도청/g, "강원특별자치도청");
}
