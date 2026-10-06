import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ row: { title: '청년 월세 지원', description: '수집된 사업 설명',
  source: '고성군청', source_url: 'https://www.gwgs.go.kr/notice?id=123',
  unique_insight: '공고에 없는 서류를 반드시 준비해야 합니다. '.repeat(8),
  apply_end: null, eligibility: null, apply_method: null, benefits: null,
  target: null, region: '강원', region_tags: ['강원'] } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const query = { select: () => query, not: () => query, eq: () => query,
    single: async () => ({ data: mocks.row }) };
  return query;
} }) }));
import { generateMetadata as welfareMetadata } from '@/app/welfare/[id]/page';
import { generateMetadata as loanMetadata } from '@/app/loan/[id]/page';
it('검수되지 않은 기존 설명은 복지와 대출의 검색 설명에도 남기지 않는다', async () => {
  for (const generate of [welfareMetadata, loanMetadata]) {
    const metadata = await generate({ params: Promise.resolve({ id: '정책' }) });
    expect(metadata.description).not.toContain('공고에 없는 서류');
  }
});
