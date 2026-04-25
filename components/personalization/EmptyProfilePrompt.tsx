// components/personalization/EmptyProfilePrompt.tsx
// 로그인했지만 프로필이 비어있는 사용자에게 온보딩(프로필 입력)을 유도하는 배너
// 맞춤 추천 섹션 대신 이 배너를 보여줌
import Link from 'next/link';

// 컴포넌트가 받는 속성(props) 타입
// href: 프로필 입력 페이지 주소 (기본값: '/onboarding')
export function EmptyProfilePrompt({ href = '/onboarding' }: { href?: string }) {
  return (
    // 점선 테두리의 연두색 배너 — 부드러운 유도, 강요하지 않는 느낌
    <div className="mb-6 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 sm:p-5">
      {/* 주요 안내 문구 */}
      <p className="text-sm text-emerald-900 font-medium">
        프로필을 채우면 맞춤 정책을 보여드려요
      </p>

      {/* 보조 설명: 소요 시간과 이점을 간략히 안내 */}
      <p className="text-xs text-emerald-700 mt-1">
        나이·지역·관심사 입력 1분 — 내 조건에 맞는 정책만 골라보세요.
      </p>

      {/* 프로필 입력 페이지로 이동하는 버튼 (next/link 사용) */}
      <Link
        href={href}
        className="inline-block mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
      >
        프로필 채우기 →
      </Link>
    </div>
  );
}
