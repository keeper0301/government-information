// lib/personalization/blog-cohort.ts
// ============================================================
// blog 전용 cohort 적합도 필터
// ============================================================
// score.ts 의 isCohortMismatch 는 정책 본문(welfare/loan)에 충분한 텍스트가 있는
// 경우를 가정하지만, blog_posts 는 짧은 meta_description + category(청년/노년/
// 학생·교육/소상공인) 라서 본문 키워드 검사로는 cohort 판단이 약함.
// 이 모듈은 blog category 와 사용자 프로필을 직접 비교해 부적합 글을 제외한다.
//
// 적용 위치: app/blog/page.tsx 의 personalSection 산출 후 후처리 필터.
// score.ts 자체는 건드리지 않아 welfare/loan/news 에는 영향 없음.
//
// 2026-04-26 사장님 보고: 30대/전남 순천시/자영업자 프로필인데 추천 6건 중
// 청년 4건·다른 광역(서울/부산/인천/울산) 4건이 노출되어 부적합. blog category
// 매핑이 BENEFIT_TAGS 만 보고 연령 cohort·지역 명시를 무시한 게 원인.
// ============================================================
import type { LoadedProfile } from "./load-profile";

// 사용자 region 외 다른 광역시도 명칭 (제목·설명에 명시되면 차단 후보)
// REGION_OPTIONS 에서 "전국" 제외한 17개 광역
const ALL_REGIONS = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
  "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;

// 광역명 정식 표기 (제목에 자주 나오는 형태) — REGION_ALIASES 와 동일 컨셉
const REGION_FULL_NAMES: Record<string, string[]> = {
  "서울": ["서울특별시", "서울시", "서울"],
  "경기": ["경기도", "경기"],
  "인천": ["인천광역시", "인천시", "인천"],
  "부산": ["부산광역시", "부산시", "부산"],
  "대구": ["대구광역시", "대구시", "대구"],
  "광주": ["광주광역시", "광주시", "광주"],
  "대전": ["대전광역시", "대전시", "대전"],
  "울산": ["울산광역시", "울산시", "울산"],
  "세종": ["세종특별자치시", "세종시", "세종"],
  "강원": ["강원특별자치도", "강원도", "강원"],
  "충북": ["충청북도", "충북"],
  "충남": ["충청남도", "충남"],
  "전북": ["전북특별자치도", "전라북도", "전북"],
  "전남": ["전라남도", "전남"],
  "경북": ["경상북도", "경북"],
  "경남": ["경상남도", "경남"],
  "제주": ["제주특별자치도", "제주도", "제주"],
};

// blog 글 입력 — page.tsx 의 BlogCardData 와 동일 필드 일부만 받음
export type BlogCohortInput = {
  category: string | null;
  title: string;
  meta_description?: string | null;
};

// 사용자 프로필 시그널 — LoadedProfile.signals 형태 그대로
export type CohortUserSignals = LoadedProfile["signals"];

// 청년 카테고리 글이 사용자에게 적합한지 — 30대 이상 사용자도 occupation
// "대학생"/"구직자" 면 청년 정책 가능성 있어 통과시킴.
function isYouthFit(user: CohortUserSignals): boolean {
  if (user.ageGroup === "10대" || user.ageGroup === "20대") return true;
  if (user.occupation === "대학생" || user.occupation === "구직자") return true;
  return false;
}

// 노년 카테고리 — 60대 이상 또는 elderly_family 가구만 통과
function isElderlyFit(user: CohortUserSignals): boolean {
  if (user.ageGroup === "60대 이상") return true;
  if (user.householdTypes.includes("elderly_family")) return true;
  return false;
}

// 학생·교육 — 10대(청소년) 또는 대학생 직업만 통과.
// 자녀 양육 가구도 자녀 교육 정보 관심 있을 수 있어 single_parent/multi_child 추가.
function isStudentEducationFit(user: CohortUserSignals): boolean {
  if (user.ageGroup === "10대") return true;
  if (user.occupation === "대학생") return true;
  if (
    user.householdTypes.includes("single_parent") ||
    user.householdTypes.includes("multi_child")
  ) return true;
  return false;
}

// 제목·설명에 다른 광역시도 명시된 글을 차단할지 판단.
// 사용자 region 미설정 → 차단 안 함 (어디에도 매칭 가능하게 둠).
// 사용자 region="전국" → 모든 광역 통과.
// 그 외 → 사용자 광역 외 다른 광역명이 텍스트에 명시되면 차단.
function passesRegionFilter(
  text: string,
  userRegion: string | null,
): boolean {
  if (!userRegion || userRegion === "전국") return true;

  // 사용자 광역의 별칭 — 텍스트에 이게 들어있으면 본인 지역이라 통과
  const userAliases = REGION_FULL_NAMES[userRegion] ?? [userRegion];
  const hasUserRegion = userAliases.some((a) => text.includes(a));
  if (hasUserRegion) return true;

  // 다른 광역 별칭이 텍스트에 명시되어 있는지 검사
  for (const region of ALL_REGIONS) {
    if (region === userRegion) continue;
    const aliases = REGION_FULL_NAMES[region] ?? [region];
    if (aliases.some((a) => text.includes(a))) {
      // 다른 광역 명시됨 → 차단
      return false;
    }
  }

  // 어떤 광역도 명시 안 된 글 (전국 정책 가이드 등) → 통과
  return true;
}

// 메인 필터 — true 면 사용자에게 노출, false 면 제외
export function isBlogCohortFit(
  post: BlogCohortInput,
  user: CohortUserSignals,
): boolean {
  // 1) 카테고리별 cohort 적합도
  switch (post.category) {
    case "청년":
      if (!isYouthFit(user)) return false;
      break;
    case "노년":
      if (!isElderlyFit(user)) return false;
      break;
    case "학생·교육":
      if (!isStudentEducationFit(user)) return false;
      break;
    // "소상공인" 또는 그 외 카테고리는 cohort 차단 안 함 (occupation/benefit_tags 매칭에 위임)
  }

  // 2) 제목·설명의 광역시도 매칭 — 사용자 광역 외 다른 광역 명시되면 차단
  const text = `${post.title ?? ""} ${post.meta_description ?? ""}`;
  if (!passesRegionFilter(text, user.region)) return false;

  return true;
}
