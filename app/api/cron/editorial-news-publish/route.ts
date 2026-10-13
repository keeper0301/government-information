import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authorizeCronRequest } from '@/lib/cron-auth';
import { runNewsPublication } from '@/lib/news-publication/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

// 기존 예약 작업 인증을 사용합니다. 실행 결과에는 비공개 원문이나 키를 담지 않습니다.
export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  try {
    const result = await runNewsPublication();
    if (result.published) {
      for (const path of ['/', '/news', ...result.slugs.map(slug => `/news/${slug}`)]) revalidatePath(path);
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '정책뉴스 자동 발행 작업에 실패했습니다.' }, { status: 500 });
  }
}
