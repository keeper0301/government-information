import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-auth-server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if (!await requireAdminUser()) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const type = params.get('type') ?? 'welfare';
  const page = Number(params.get('page') ?? 0);
  const search = (params.get('search') ?? '').trim();
  const issue = params.get('issue') ?? 'all';
  if (!['welfare', 'loan'].includes(type) || !Number.isInteger(page) || page < 0 || page > 10000
    || search.length > 100 || !['all', 'source', 'application'].includes(issue)) return NextResponse.json({ error: '검색 조건을 확인하세요.' }, { status: 400 });
  if (issue !== 'all') {
    const { data, error } = await createAdminClient().rpc('policy_guidance_issue_queue', {
      target_table: type === 'welfare' ? 'welfare_programs' : 'loan_programs',
      issue_kind: issue, search_text: search, page_number: page,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error) return NextResponse.json({ error: '주소 점검 목록의 준비 상태를 확인하세요.' }, { status: 503 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  // 승인 자료도 다시 찾을 수 있게 제목 검색을 제공하고 기본 목록은 미승인 자료로 제한한다.
  let query = createAdminClient().from(type === 'welfare' ? 'welfare_programs' : 'loan_programs')
    .select('id,title,source_url,apply_url,policy_guidance', { count: 'exact' });
  if (search) query = query.ilike('title', `%${search.replace(/[%_\\]/g, '\\$&')}%`);
  else query = query.or('policy_guidance.is.null,policy_guidance->>status.neq.approved');
  const { data, error, count } = await query.order('id').range(page * 20, page * 20 + 19)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) return NextResponse.json({ error: '검수 목록을 불러오지 못했습니다.' }, { status: 503 });
  return NextResponse.json({ items: data, total: count, page }, { headers: { 'Cache-Control': 'private, no-store' } });
}
