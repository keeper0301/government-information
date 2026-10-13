import { createAdminClient } from '@/lib/supabase/admin';
import { generatePolicyGuide } from './ai-guide';
import { createGuideDraft, programSnapshot, type EvidenceProgram } from './evidence-guide';
import { readPrivateReview, savePrivateReview } from './guidance-storage';

export type PolicyTable = 'welfare_programs' | 'loan_programs';
export async function backfillPolicyDrafts(table: PolicyTable, limit: number, ids?: string[], budgetMs = 40000) {
  const deadline = Date.now() + budgetMs;
  const admin = createAdminClient();
  let query = admin.from(table).select('*').order('view_count', { ascending: false, nullsFirst: false })
    .order('id').limit(limit).abortSignal(AbortSignal.timeout(5000));
  query = ids?.length ? query.in('id', ids) : query.is('policy_guidance', null);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: 해설 초안 조회 실패 (${error.code})`);
  const result = { table, fetched: data?.length ?? 0, drafted: 0, waiting_source: 0, failed: 0, conflict: 0, deferred: 0 };
  const rows = data ?? [];
  for (let index = 0; index < rows.length; index++) {
    // 비공개 조회 5초·원문 조회 4초·생성 20초·저장 5초를 남겨야 새 항목을 시작한다.
    if (deadline - Date.now() < 35000) { result.deferred = rows.length - index; break; }
    const row = rows[index];
    // 이미 승인된 설명은 자동 작업으로 덮어쓰지 않는다.
    if (row.policy_guidance?.status === 'approved') continue;
    try {
      const review = await readPrivateReview(admin, table, row.id);
      if ((review?.guidance as { status?: string })?.status === 'approved') continue;
      let sourceBody = typeof row.detailed_content === 'string' ? row.detailed_content : null;
      if (row.source_code === 'press_l2_confirm' && row.source_id) {
        const { data: news, error: newsError } = await admin.from('news_posts')
          .select('body,source_url').eq('id', row.source_id).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
        if (newsError) throw new Error('연결된 원문 조회 실패');
        if (news && news.source_url === row.source_url) sourceBody = news.body;
      }
      const generated = await generatePolicyGuide({ title: row.title, summary: null,
        category: row.category, target: row.target, sourceUrl: row.source_url, sourceBody });
      if (!generated.llmOk) { result.failed++; continue; }
      const hasSections = !!generated.sections?.length;
      const guidance = hasSections ? createGuideDraft(row as EvidenceProgram, {
        url: row.source_url, title: row.title, body: sourceBody!.slice(0, 20000), checkedAt: null,
      }, generated.sections!) : { version: 1, status: 'needs_source',
        programSnapshot: programSnapshot(row as EvidenceProgram), reason: '원문 또는 근거 있는 설명 확인 필요' };
      const saved = await savePrivateReview(admin, table, row, review, guidance);
      if (!saved) { result.conflict++; continue; }
      if (hasSections) result.drafted++; else result.waiting_source++;
    } catch { result.failed++; }
  }
  return result;
}
