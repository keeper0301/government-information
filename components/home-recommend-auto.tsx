// components/home-recommend-auto.tsx
// 로그인 + 프로필이 채워진 사용자에게 보여주는 자동 추천 카드 (서버 컴포넌트)
// HomeRecommendCard (입력 폼) 와 같은 자리에 server-rendered
// 'use client' 없음 — createClient 사용 가능
import Link from "next/link";
import { createClient } from '@/lib/supabase/server';
import { loadUserProfile } from '@/lib/personalization/load-profile';
import { scoreAndFilter } from '@/lib/personalization/filter';
import { PERSONAL_SECTION_MIN_SCORE } from '@/lib/personalization/types';
import { REGION_ALIASES, type ScorableItem } from '@/lib/personalization/score';

// DB welfare_programs raw 행 → ScorableItem 변환
// 정정 (2026-04-25 hot-fix): benefit_tags 컬럼은 실제 DB 에 있음 (031 분류 통일).
// 이전엔 manual 타입에 누락돼 있어 null 처리했지만, 이제 그대로 활용해
// 사용자 benefit_tags 와 교집합 +3 점/태그 매칭이 작동.
function welfareRowToScorable(row: {
  id: string;
  title: string;
  description: string | null;
  eligibility: string | null;
  detailed_content: string | null;
  region: string | null;
  apply_end: string | null;
  source: string;
  benefit_tags: string[] | null;
  // Phase 1.5: 소득 분위 + 가구 유형 — DB 043 마이그레이션으로 추가된 컬럼
  income_target_level: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags: string[] | null;
}): ScorableItem {
  return {
    id: row.id,
    title: row.title,
    // description + eligibility + detailed_content 를 합쳐서 키워드 매칭 풍성하게
    description: [row.description, row.eligibility, row.detailed_content]
      .filter(Boolean)
      .join(' '),
    region: row.region,
    district: null,      // welfare_programs 에 district 컬럼 없음 (광역만)
    benefit_tags: row.benefit_tags ?? [],
    apply_end: row.apply_end,
    source: row.source,
    // Phase 1.5: 소득 분위 + 가구 유형 신호 — 점수 계산에 활용
    income_target_level: row.income_target_level,
    household_target_tags: row.household_target_tags ?? [],
  };
}

// pool 크기 — 사용자 광역+전국 풀에서 가져올 후보 수.
// 100 일 때 사장님(전남 순천시) 케이스에서 마감 임박 100건이 다른 광역만으로
// 채워져 매칭 0건 사고. 200 으로 확대하되 region 우선 필터로 효율 유지.
const POOL_SIZE = 200;

// 사용자 광역+전국만 매칭되도록 PostgREST .or() 패턴 빌드.
// 예) 사용자 region="전남" → "region.ilike.%전국%,region.ilike.%전라남도%,region.ilike.%전남%"
// REGION_ALIASES 와 같은 별칭을 사용해 score.ts 의 evaluateRegion 과 일관성 확보.
function buildRegionOrFilter(userRegion: string | null): string | null {
  if (!userRegion) return null;
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  // ilike 는 % wildcard 사용. 별칭과 "전국" 모두 OR 로 묶음.
  // 일부 정책 region 이 "전국, 서울" 처럼 콤마 결합돼 있을 수 있어 substring 매칭 사용.
  const clauses = ['region.ilike.%전국%', ...aliases.map((a) => `region.ilike.%${a}%`)];
  return clauses.join(',');
}

// 로그인 + 프로필 채워짐 → region 우선 정책 200건 가져와 점수 매칭 → 상위 5건 렌더
// 빈 프로필이거나 매칭 결과 0건이면 fallback 카드 (전체 정책 보기 CTA)
export async function HomeRecommendAuto() {
  const profile = await loadUserProfile();
  // 빈 프로필이거나 로그인 안 된 경우 — 호출자에서 분기하지만 방어적 처리
  if (!profile || profile.isEmpty) return null;

  const supabase = await createClient();

  // 마감이 지나지 않은 (또는 마감일 미지정) 활성 정책 중
  // 사용자 광역+전국만 추려 마감 임박순으로 가져옴.
  // 사장님(전남 순천시) 케이스 hot-fix — 다른 광역 정책이 pool 100건을
  // 거의 다 채워 매칭 0건 사고 차단.
  const today = new Date().toISOString().slice(0, 10);
  let query = supabase
    .from('welfare_programs')
    .select('id, title, description, eligibility, detailed_content, region, apply_end, source, benefit_tags, income_target_level, household_target_tags')
    .or(`apply_end.gte.${today},apply_end.is.null`);

  // region 설정된 사용자 → 사용자 광역+전국 우선 필터.
  // region 미설정 사용자 → 전체 풀 (빈 프로필 추천 가능해야 함)
  const regionOrFilter = buildRegionOrFilter(profile.signals.region);
  if (regionOrFilter) {
    query = query.or(regionOrFilter);
  }

  const { data: pool } = await query
    .order('apply_end', { ascending: true, nullsFirst: false })
    .limit(POOL_SIZE);

  // DB 결과를 점수 계산 가능한 형태로 변환
  const scorable = (pool ?? []).map(welfareRowToScorable);

  // 점수 매칭: minScore 이상인 항목만 → 점수 내림차순 → 상위 5건
  const items = scoreAndFilter(scorable, profile.signals, {
    minScore: PERSONAL_SECTION_MIN_SCORE,
    limit: 5,
  });

  // 매칭 결과 0건 → null 대신 fallback 카드 (hero 우측 빈 영역 사고 차단).
  // 사장님 본인 화면에서 매일 보는 자리라 빈 영역은 즉각 UX 사고로 체감.
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-grey-200 bg-white p-5 sm:p-6 shadow-lg">
        <h2 className="text-base sm:text-lg font-bold text-grey-900 mb-2">
          🌟 {profile.displayName}님께 맞는 정책
        </h2>
        <p className="text-sm text-grey-600 leading-[1.55] mb-4">
          지금은 마감 임박 정책 중 키퍼님 조건과 딱 맞는 게 적어요.
          <br />
          전체 정책에서 더 많은 정보를 확인해보세요.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/welfare"
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 no-underline transition-colors min-h-[44px]"
          >
            복지 전체 정책 보기 →
          </Link>
          <Link
            href="/recommend"
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 no-underline transition-colors min-h-[44px]"
          >
            맞춤 조건 다시 검색
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-grey-200 bg-white p-5 sm:p-6 shadow-lg">
      {/* 제목 행: 왼쪽에 "님께 맞는 정책" + 건수, 오른쪽에 "전체 보기" 링크 */}
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-base sm:text-lg font-bold text-grey-900">
          🌟 {profile.displayName}님께 맞는 정책
          <span className="ml-2 text-xs text-grey-500 font-normal">
            {items.length}건
          </span>
        </h2>
        <Link
          href="/welfare"
          className="text-xs text-blue-500 hover:text-blue-600 underline"
        >
          전체 보기 →
        </Link>
      </div>

      {/* 추천 정책 목록 — 각 항목은 /welfare/[id] 상세 링크 */}
      <ul className="space-y-2.5">
        {items.map(({ item }) => (
          <li key={item.id}>
            <a
              href={`/welfare/${item.id}`}
              className="block py-2 px-3 rounded-lg hover:bg-grey-50 transition"
            >
              {/* 정책 제목 — 2줄 초과 시 말줄임표 */}
              <div className="text-sm font-medium text-grey-900 line-clamp-2">
                {item.title}
              </div>
              {/* 마감일이 있는 경우만 표시 */}
              {item.apply_end && (
                <div className="text-xs text-grey-500 mt-1">
                  마감 {item.apply_end}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
