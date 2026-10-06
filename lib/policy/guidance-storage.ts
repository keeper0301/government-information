import { createAdminClient } from '@/lib/supabase/admin';
import { publicGuidance, type EvidenceProgram } from './evidence-guide';

type Admin = ReturnType<typeof createAdminClient>;
export type PrivateReview = { guidance: unknown; revision: string };
export async function readPrivateReview(admin: Admin, table: string, id: string): Promise<PrivateReview | null> {
  const { data, error } = await admin.from('policy_guidance_reviews').select('guidance,revision')
    .eq('program_table', table).eq('program_id', id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error) throw new Error('비공개 검수 자료 조회 실패');
  return data;
}
export async function savePrivateReview(admin: Admin, table: string, row: EvidenceProgram,
  review: PrivateReview | null, guidance: unknown): Promise<boolean> {
  // 정책과 비공개 초안의 두 이전 상태를 함께 확인하고 같은 저장 작업에서 공개본을 반영한다.
  const { data, error } = await admin.rpc('save_policy_guidance_review', {
    target_table: table, target_id: row.id, expected_updated_at: row.updated_at,
    expected_public: row.policy_guidance ?? null, expected_revision: review?.revision ?? null,
    private_guidance: guidance, published_guidance: publicGuidance(row, guidance),
  }).abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('비공개 검수 자료 저장 실패');
  return data === true;
}
