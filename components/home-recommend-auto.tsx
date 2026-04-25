// components/home-recommend-auto.tsx
// 로그인 + 프로필이 채워진 사용자에게 보여주는 자동 추천 카드 (서버 컴포넌트)
// HomeRecommendCard (입력 폼) 와 같은 자리에 server-rendered
// 'use client' 없음 — createClient 사용 가능
import { createClient } from '@/lib/supabase/server';
import { loadUserProfile } from '@/lib/personalization/load-profile';
import { scoreAndFilter } from '@/lib/personalization/filter';
import { PERSONAL_SECTION_MIN_SCORE } from '@/lib/personalization/types';
import type { ScorableItem } from '@/lib/personalization/score';

// DB welfare_programs raw 행 → ScorableItem 변환
// welfare_programs 에 benefit_tags·district 컬럼 없으므로 null 처리
// (welfare/page.tsx 의 welfareToScorable 와 동일 패턴)
function welfareRowToScorable(row: {
  id: string;
  title: string;
  description: string | null;
  eligibility: string | null;
  detailed_content: string | null;
  region: string | null;
  apply_end: string | null;
  source: string;
}): ScorableItem {
  return {
    id: row.id,
    title: row.title,
    // description + eligibility + detailed_content 를 합쳐서 키워드 매칭 풍성하게
    description: [row.description, row.eligibility, row.detailed_content]
      .filter(Boolean)
      .join(' '),
    region: row.region,
    district: null,      // welfare_programs 에 district 컬럼 없음
    benefit_tags: null,  // welfare_programs 에 benefit_tags 컬럼 없음
    apply_end: row.apply_end,
    source: row.source,
  };
}

// 로그인 + 프로필 채워짐 → 활성 정책 100건 가져와 점수 매칭 → 상위 5건 렌더
// 빈 프로필이거나 매칭 결과 0건이면 null (호출자에서 분기 처리)
export async function HomeRecommendAuto() {
  const profile = await loadUserProfile();
  // 빈 프로필이거나 로그인 안 된 경우 — 호출자에서 분기하지만 방어적 처리
  if (!profile || profile.isEmpty) return null;

  const supabase = await createClient();

  // 마감이 지나지 않은 (또는 마감일 미지정) 활성 정책 100건 조회
  // apply_end 오름차순 — 마감 임박 순으로 상위권에 배치
  const today = new Date().toISOString().slice(0, 10);
  const { data: pool } = await supabase
    .from('welfare_programs')
    .select('id, title, description, eligibility, detailed_content, region, apply_end, source')
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order('apply_end', { ascending: true, nullsFirst: false })
    .limit(100);

  // DB 결과를 점수 계산 가능한 형태로 변환
  const scorable = (pool ?? []).map(welfareRowToScorable);

  // 점수 매칭: minScore 이상인 항목만 → 점수 내림차순 → 상위 5건
  const items = scoreAndFilter(scorable, profile.signals, {
    minScore: PERSONAL_SECTION_MIN_SCORE,
    limit: 5,
  });

  // 매칭 결과가 없으면 아무것도 안 보여줌
  if (items.length === 0) return null;

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
        <a
          href="/welfare"
          className="text-xs text-blue-500 hover:text-blue-600 underline"
        >
          전체 보기 →
        </a>
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
