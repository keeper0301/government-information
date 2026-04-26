// app/eligibility/page.tsx
// 자격 카테고리 인덱스 페이지 — 8개 슬러그 카드 그리드.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ELIGIBILITY_CATALOG, ELIGIBILITY_SLUGS } from '@/lib/eligibility/catalog';

export const revalidate = 86400; // 24h ISR — catalog 변경 빈도 매우 낮음

export const metadata: Metadata = {
  title: '자격별 정책 모음 — keepioo',
  description:
    '소득 분위·가구 형태별로 본인이 받을 수 있는 정부 지원 정책을 모았어요. 기초생활·차상위·한부모·다자녀·신혼부부·장애·고령·1인 가구.',
  alternates: { canonical: 'https://www.keepioo.com/eligibility' },
};

const INCOME_SLUGS = ELIGIBILITY_SLUGS.filter(
  (s) => ELIGIBILITY_CATALOG[s].type === 'income',
);
const HOUSEHOLD_SLUGS = ELIGIBILITY_SLUGS.filter(
  (s) => ELIGIBILITY_CATALOG[s].type === 'household',
);

export default function EligibilityIndexPage() {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:pt-24 max-md:px-6">
      <h1 className="text-[32px] font-extrabold tracking-[-1px] text-grey-900 mb-3 max-md:text-[26px]">
        자격별 정책 모음
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.65] mb-10 max-w-[640px]">
        소득 분위·가구 형태별로 본인이 받을 수 있는 정부 지원 정책을 모았어요.
        본문 자동 분석으로 매일 업데이트.
      </p>

      <Section title="소득 분위별" slugs={INCOME_SLUGS} />
      <Section title="가구 형태별" slugs={HOUSEHOLD_SLUGS} />
    </main>
  );
}

function Section({ title, slugs }: { title: string; slugs: typeof ELIGIBILITY_SLUGS }) {
  return (
    <section className="mb-12 last:mb-0">
      <h2 className="text-[18px] font-bold text-grey-900 mb-4 tracking-[-0.3px]">
        {title}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-md:grid-cols-1">
        {slugs.map((slug) => {
          const c = ELIGIBILITY_CATALOG[slug];
          return (
            <Link
              key={slug}
              href={`/eligibility/${slug}`}
              className="block bg-white rounded-2xl shadow-sm p-5 no-underline hover:shadow-md transition-shadow"
            >
              <div className="text-[16px] font-bold text-grey-900 mb-1.5 tracking-[-0.3px]">
                {c.label}
              </div>
              <p className="text-[13px] text-grey-600 leading-[1.55] line-clamp-2">
                {c.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
