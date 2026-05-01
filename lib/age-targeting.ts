// lib/age-targeting.ts
// ============================================================
// 연령 기반 long-tail SEO 페이지의 카탈로그 + DB 매칭 헬퍼.
// /welfare/age/[age] · /loan/age/[age] 두 라우트가 공유.
// ============================================================
// 배경 (Phase 2 A1, 2026-04-29):
//   /welfare/region/[code] 와 동일한 path-based long-tail 전략.
//   "청년 지원금", "노인 복지", "학생 학자금" 같은 광역 키워드를
//   고유 URL 로 분리 → 검색엔진 색인 점수 분산 방지.
//
// 매칭 전략:
//   - DB 컬럼 age_target_min/max (정수) 와 카탈로그 [min,max] 가 겹치면 매칭
//   - household_target_tags (텍스트 배열) 일부 매칭도 허용 (parent·senior 등)
//   - 두 조건은 OR 합집합 → 가능한 정책 누락 최소화
// ============================================================

export type AgeSlug = "youth" | "middle" | "senior" | "parent" | "student";

export interface AgeCategory {
  slug: AgeSlug;
  label: string; // 한국어 라벨 (페이지 제목)
  shortLabel: string; // 카드/배지용 짧은 라벨
  description: string; // SEO meta description
  // DB 매칭 정보 — age_target_min/max 범위 또는 household_target_tags 매칭
  matchAge?: { min?: number; max?: number };
  householdTags?: string[];
}

export const AGE_CATALOG: Record<AgeSlug, AgeCategory> = {
  youth: {
    slug: "youth",
    label: "청년 (19~34세)",
    shortLabel: "청년",
    description:
      "19~34세 청년이 받을 수 있는 정부·지자체 지원 정책 모음. 자격·신청 방법·마감일을 한곳에 정리.",
    matchAge: { min: 19, max: 34 },
  },
  middle: {
    slug: "middle",
    label: "중년 (35~49세)",
    shortLabel: "중년",
    description:
      "35~49세 중년이 받을 수 있는 정부·지자체 지원 정책 모음. 의료·자녀·주거·창업 등 카테고리별로.",
    matchAge: { min: 35, max: 49 },
  },
  senior: {
    slug: "senior",
    label: "노년 (65세 이상)",
    shortLabel: "노년",
    description:
      "65세 이상 어르신이 받을 수 있는 노인 복지·연금·의료비·돌봄 정책 모음.",
    matchAge: { min: 65 },
    householdTags: ["elderly"],
  },
  parent: {
    slug: "parent",
    label: "육아·자녀양육",
    shortLabel: "육아",
    description:
      "자녀를 양육 중인 부모가 받을 수 있는 양육비·교육비·돌봄 정책 모음.",
    householdTags: ["multi_child", "single_parent"],
  },
  student: {
    slug: "student",
    label: "학생 (재학·휴학)",
    shortLabel: "학생",
    description:
      "초·중·고·대학 재학생이 받을 수 있는 학자금·생활비·문화비 지원 정책 모음.",
    matchAge: { min: 7, max: 24 },
  },
};

export const AGE_SLUGS = Object.keys(AGE_CATALOG) as AgeSlug[];

type AgeCountQuery = {
  select: (columns: string) => {
    not: (
      column: string,
      operator: string,
      value: string,
    ) => {
      or: (
        filter: string,
      ) => PromiseLike<{
        data: unknown;
      }>;
    };
  };
};

export function getAgeCategory(slug: string): AgeCategory | null {
  return (AGE_CATALOG as Record<string, AgeCategory>)[slug] ?? null;
}

// sitemap 카운트 헬퍼 — table='welfare_programs' | 'loan_programs'.
// thin-content 가드용 (≥5 만 sitemap 등록). 비매칭 source_code 제외 + 마감 안 지난 것만.
export async function getAgeCounts(
  // supabase client 타입을 좁게 잡으면 server·anon 양쪽 호환됨
  supabase: { from: (t: string) => AgeCountQuery },
  table: "welfare_programs" | "loan_programs",
  excludedFilter: string,
): Promise<Map<AgeSlug, number>> {
  const today = new Date().toISOString().split("T")[0];
  const counts = new Map<AgeSlug, number>();

  // age_target_min/max 와 household_target_tags 만 가벼운 select.
  // ≥ 5 임계 카운트만 필요해 따로 limit 없음.
  const { data } = await supabase
    .from(table)
    .select("age_target_min, age_target_max, household_target_tags")
    .not("source_code", "in", excludedFilter)
    .or(`apply_end.gte.${today},apply_end.is.null`);

  if (!data) return counts;

  for (const row of data as Array<{
    age_target_min: number | null;
    age_target_max: number | null;
    household_target_tags: string[] | null;
  }>) {
    const ageMin = row.age_target_min ?? null;
    const ageMax = row.age_target_max ?? null;
    const tags = row.household_target_tags ?? [];

    for (const slug of AGE_SLUGS) {
      const cat = AGE_CATALOG[slug];
      let match = false;
      // age 범위 매칭 — DB row 의 [ageMin, ageMax] 가 카탈로그 범위와 겹치면 OK
      if (cat.matchAge && (ageMin !== null || ageMax !== null)) {
        const catMin = cat.matchAge.min ?? 0;
        const catMax = cat.matchAge.max ?? 200;
        const rowMin = ageMin ?? 0;
        const rowMax = ageMax ?? 200;
        if (rowMin <= catMax && rowMax >= catMin) match = true;
      }
      // household_target_tags 매칭
      if (!match && cat.householdTags) {
        if (cat.householdTags.some((t) => tags.includes(t))) match = true;
      }
      if (match) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}
