import { isDeepLink, sanitizeApplyUrl } from '@/lib/utils/apply-url';
import { extractUrlsFromBody, isPublicDomain } from './url-fallback';
import type { createAdminClient } from '@/lib/supabase/admin';

// 기관 주소 형식만으로는 실제 신청 주소임을 증명할 수 없다.
// 모델이 만든 주소는 원문에 실제 등장한 상세 주소와 일치하는 경우만 남긴다.
export function groundedApplicationUrl(value: unknown, body: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const safe = sanitizeApplyUrl(value);
  if (!safe || !isPublicDomain(safe) || !isDeepLink(safe)) return null;
  const parsed = new URL(safe);
  if (parsed.username || parsed.password || parsed.pathname === '/') return null;
  const actualUrls = extractUrlsFromBody(body);
  return actualUrls.some(actual => {
    try { return new URL(actual).href === parsed.href; } catch { return false; }
  }) ? safe : null;
}

// 사람이 볼 대기 상태는 유지하고 자동 처리에서만 제외한다. 재분류하면 보류 이유가 초기화된다.
export async function holdApplicationReview(admin: ReturnType<typeof createAdminClient>,
  candidate: { id: string; classified_payload: unknown }): Promise<string | null> {
  const { error } = await admin.from('press_ingest_candidates').update({
    skip_reason: 'application_source_unverified',
    error_message: '원문에 있는 실제 신청 상세 주소를 확인한 뒤 검토해 주세요.',
    updated_at: new Date().toISOString(),
  }).eq('id', candidate.id).eq('status', 'pending')
    // 최초 조회 후 사람이 수정한 내용에는 오래된 보류 표시를 덮어쓰지 않는다.
    .eq('classified_payload', JSON.stringify(candidate.classified_payload));
  return error ? '신청 주소 검수 대기 표시 저장 실패' : null;
}
