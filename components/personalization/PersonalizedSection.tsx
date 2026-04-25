// components/personalization/PersonalizedSection.tsx
// "🌟 ○○님께 맞는 정책" 분리 섹션 공통 컴포넌트
// render prop 패턴으로 카드 컴포넌트를 받아 영역별(welfare/loan/news/blog) 재사용 가능
import type { ScoredItem } from '@/lib/personalization/types';
import type { ScorableItem } from '@/lib/personalization/score';

// 컴포넌트가 받는 속성(props) 타입 정의
// T는 ScorableItem을 확장하는 제네릭 타입 — welfare/loan 등 영역마다 다른 데이터 구조를 처리
type Props<T extends ScorableItem> = {
  items: ScoredItem<T>[];                                            // 점수가 매겨진 항목 목록
  userName?: string | null;                                          // 사용자 이름 (없으면 "회원님"으로 표시)
  renderCard: (item: T, signals: ScoredItem<T>['signals']) => React.ReactNode; // 카드 렌더링 함수 (render prop)
  totalLink?: { href: string; label: string };                       // "전체 보기" 링크 (선택 사항)
};

// 개인화 추천 섹션 컴포넌트
// items가 비어있으면 아무것도 렌더링하지 않음
export function PersonalizedSection<T extends ScorableItem>({
  items,
  userName,
  renderCard,
  totalLink,
}: Props<T>) {
  // 추천 항목이 없으면 섹션 자체를 숨김
  if (items.length === 0) return null;

  // 이름이 있으면 "○○님께", 없으면 "회원님께"로 인사말 구성
  const greeting = userName ? `${userName}님께` : '회원님께';

  return (
    <section className="mb-8">
      {/* 섹션 헤더: 인사말 + 건수 + 전체 보기 링크 */}
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-lg font-bold text-zinc-900">
          🌟 {greeting} 맞는 정책
          {/* 프로필 기반 추천임을 작은 글씨로 표시 */}
          <span className="ml-2 text-xs text-zinc-500 font-normal">
            프로필 기반 · {items.length}건
          </span>
        </h2>

        {/* "전체 보기" 링크 — totalLink prop이 있을 때만 표시 */}
        {totalLink && (
          <a
            href={totalLink.href}
            className="text-xs text-emerald-700 hover:text-emerald-900 underline"
          >
            {totalLink.label} →
          </a>
        )}
      </div>

      {/* 카드 목록: 2열 그리드 (모바일은 1열) */}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(({ item, signals }) => (
          // key는 item.id 사용 (ScorableItem에 id 필드 포함)
          <div key={item.id}>{renderCard(item, signals)}</div>
        ))}
      </div>
    </section>
  );
}
