import { createAdminClient } from '@/lib/supabase/admin';

// 실행 결과의 건수와 종료 사유만 보존합니다. 기록 실패를 발행 실패로 바꾸지 않습니다.
export async function saveNewsRun(result: Record<string, unknown>) {
  try {
    const { error } = await createAdminClient().from('editorial_news_runs').insert({ result });
    return !error;
  } catch { return false; }
}
